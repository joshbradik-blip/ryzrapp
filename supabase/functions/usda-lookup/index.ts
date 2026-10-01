// Authenticated server-side lookup against USDA FoodData Central (FDC). The
// FDC key lives in the USDA_API_KEY Edge Function secret and is never shipped
// in the Expo bundle. Matches are cached in food_lookup_cache so the same
// food always resolves to the same entry.
//
// Request:  { items: [{ query: string, state?: 'cooked' | 'raw' | 'prepared' }] }   (max 20)
// Response: { results: [{ query, match: null | { fdcId, description, dataType, per100, cached } }] }
//
// A null match means "nothing good enough" — the client keeps the model's own
// per-100g estimate for that item.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  FDC_DATA_TYPES,
  normalizeQuery,
  pickBestFood,
  type FdcFood,
  type FoodState,
  type UsdaMatch,
} from '../_shared/usdaMatch.ts';

const FDC_SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const MAX_ITEMS = 20;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const STATES: FoodState[] = ['cooked', 'raw', 'prepared'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication required' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid session' }, 401);

  const apiKey = Deno.env.get('USDA_API_KEY');
  if (!apiKey) return json({ error: 'USDA lookup is not configured' }, 503);

  let body: { items?: { query?: unknown; state?: unknown }[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!Array.isArray(body.items) || body.items.length === 0) return json({ error: 'items is required' }, 400);

  const requests = body.items.slice(0, MAX_ITEMS).map((it) => {
    const query = typeof it?.query === 'string' ? normalizeQuery(it.query) : '';
    const state = STATES.includes(it?.state as FoodState) ? (it.state as FoodState) : 'prepared';
    return { query, state, key: `${query}|${state}` };
  });

  // Service-role client for the cache table (RLS blocks every other role).
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

  const lookupOne = async (r: { query: string; state: FoodState; key: string }) => {
    if (!r.query) return { query: r.query, match: null };

    try {
      const { data: hit } = await admin
        .from('food_lookup_cache')
        .select('fdc_id, description, data_type, calories, protein_g, carbs_g, fat_g')
        .eq('cache_key', r.key)
        .maybeSingle();
      if (hit) {
        return {
          query: r.query,
          match: {
            fdcId: hit.fdc_id,
            description: hit.description,
            dataType: hit.data_type,
            per100: {
              calories: Number(hit.calories),
              protein_g: Number(hit.protein_g),
              carbs_g: Number(hit.carbs_g),
              fat_g: Number(hit.fat_g),
            },
            cached: true,
          },
        };
      }
    } catch (e) {
      console.error('cache read failed:', e instanceof Error ? e.message : e);
    }

    try {
      const res = await fetch(FDC_SEARCH_URL, {
        method: 'POST',
        // Key in a header, not the URL, so it stays out of request logs.
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
        body: JSON.stringify({ query: r.query, dataType: FDC_DATA_TYPES, pageSize: 15 }),
      });
      if (!res.ok) {
        console.error('FDC search failed:', res.status);
        return { query: r.query, match: null };
      }
      const data = (await res.json()) as { foods?: FdcFood[] };
      const match: UsdaMatch | null = pickBestFood(r.query, r.state, data.foods ?? []);
      if (!match) return { query: r.query, match: null };

      const { error: upsertError } = await admin.from('food_lookup_cache').upsert({
        cache_key: r.key,
        fdc_id: match.fdcId,
        description: match.description.slice(0, 200),
        data_type: match.dataType,
        calories: match.per100.calories,
        protein_g: match.per100.protein_g,
        carbs_g: match.per100.carbs_g,
        fat_g: match.per100.fat_g,
      });
      if (upsertError) console.error('cache write failed:', upsertError.message);
      return { query: r.query, match: { ...match, cached: false } };
    } catch (e) {
      console.error('FDC lookup error:', e instanceof Error ? e.message : e);
      return { query: r.query, match: null };
    }
  };

  const results = await Promise.all(requests.map(lookupOne));
  return json({ results });
});

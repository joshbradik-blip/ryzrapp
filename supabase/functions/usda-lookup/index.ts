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
// Hard time limits. A hung upstream must never hold the request open: the app
// is waiting on this and falls back to the model's numbers on any null match.
const CACHE_TIMEOUT_MS = 3000;
const FDC_TIMEOUT_MS = 6000;
const ITEM_DEADLINE_MS = 8000;

/** Rejects if `p` hasn't settled within `ms`, so a stuck call can't hang the function. */
const withTimeout = <T>(p: PromiseLike<T>, ms: number, label: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
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
      const { data: hit } = await withTimeout(
        admin
          .from('food_lookup_cache')
          .select('fdc_id, description, data_type, calories, protein_g, carbs_g, fat_g')
          .eq('cache_key', r.key)
          .maybeSingle(),
        CACHE_TIMEOUT_MS,
        'cache read',
      );
      if (hit) {
        console.log(`[usda] cache hit: "${r.key}" -> ${hit.description}`);
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
        signal: AbortSignal.timeout(FDC_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error('FDC search failed:', res.status);
        return { query: r.query, match: null };
      }
      const data = (await res.json()) as { foods?: FdcFood[] };
      const foods = data.foods ?? [];
      const match: UsdaMatch | null = pickBestFood(r.query, r.state, foods);
      if (!match) {
        // Log what USDA offered so a too-strict matcher can be tuned from real data.
        console.log(
          `[usda] no match: "${r.key}" (${foods.length} candidates) top: ` +
            foods.slice(0, 3).map((f) => f.description).join(' | '),
        );
        return { query: r.query, match: null };
      }
      console.log(`[usda] matched: "${r.key}" -> ${match.description} (${match.dataType})`);

      const { error: upsertError } = await withTimeout(
        admin.from('food_lookup_cache').upsert({
          cache_key: r.key,
          fdc_id: match.fdcId,
          description: match.description.slice(0, 200),
          data_type: match.dataType,
          calories: match.per100.calories,
          protein_g: match.per100.protein_g,
          carbs_g: match.per100.carbs_g,
          fat_g: match.per100.fat_g,
        }),
        CACHE_TIMEOUT_MS,
        'cache write',
      );
      if (upsertError) console.error('cache write failed:', upsertError.message);
      return { query: r.query, match: { ...match, cached: false } };
    } catch (e) {
      console.error('FDC lookup error:', e instanceof Error ? e.message : e);
      return { query: r.query, match: null };
    }
  };

  const started = Date.now();
  const results = await Promise.all(
    requests.map((r) =>
      withTimeout(lookupOne(r), ITEM_DEADLINE_MS, `lookup "${r.key}"`).catch((e) => {
        console.error('[usda]', e instanceof Error ? e.message : e);
        return { query: r.query, match: null };
      }),
    ),
  );
  console.log(`[usda] ${results.filter((x) => x.match).length}/${results.length} matched in ${Date.now() - started}ms`);
  return json({ results });
});

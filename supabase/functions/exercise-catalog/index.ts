// Authenticated server-side proxy for ExerciseDB. The RapidAPI key must be
// configured as a Supabase Edge Function secret and never shipped in Expo.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RAPIDAPI_URL = 'https://exercisedb.p.rapidapi.com';
const RAPIDAPI_HOST = 'exercisedb.p.rapidapi.com';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authorization = req.headers.get('Authorization');
  if (!authorization) return json({ error: 'Authentication required' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return json({ error: 'Invalid session' }, 401);

  // `rapid_key` is the existing production secret. The uppercase fallback
  // keeps local/new-project setup conventional without requiring a rename.
  const apiKey = Deno.env.get('rapid_key') ?? Deno.env.get('RAPIDAPI_EXERCISEDB_KEY');
  if (!apiKey) return json({ error: 'Exercise catalog is not configured' }, 503);

  let body: { action?: string; query?: string; limit?: number; offset?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const query = body.query?.trim();
  if (!query) return json({ error: 'query is required' }, 400);
  const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);
  const offset = Math.max(Number(body.offset) || 0, 0);
  const routes: Record<string, string> = {
    search: 'name',
    target: 'target',
    bodyPart: 'bodyPart',
  };
  const route = body.action ? routes[body.action] : undefined;
  if (!route) return json({ error: 'Invalid action' }, 400);

  try {
    const response = await fetch(
      `${RAPIDAPI_URL}/exercises/${route}/${encodeURIComponent(query)}?limit=${limit}&offset=${offset}`,
      { headers: { 'x-rapidapi-host': RAPIDAPI_HOST, 'x-rapidapi-key': apiKey } },
    );
    if (!response.ok) {
      console.error(`ExerciseDB request failed with status ${response.status}`);
      return json({ error: 'Exercise catalog request failed' }, response.status === 429 ? 429 : 502);
    }
    return json({ exercises: await response.json(), source: 'exercisedb' });
  } catch (error) {
    console.error('ExerciseDB request failed', error instanceof Error ? error.message : 'unknown error');
    return json({ error: 'Exercise catalog request failed' }, 502);
  }
});

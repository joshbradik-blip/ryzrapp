// Mints a short-lived Terra auth token for the signed-in user.
//
// Exists so TERRA_API_KEY never ships inside the app binary. The client calls
// this with its Supabase JWT, and gets back only a scoped, expiring token plus
// the (public) dev id, which is what terra-react's initConnection() needs.
//
// Secrets (set via `supabase secrets set`):
//   TERRA_DEV_ID   — also public; returned to the client
//   TERRA_API_KEY  — SECRET. Never returned.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const devId = Deno.env.get('TERRA_DEV_ID') ?? '';
  const apiKey = Deno.env.get('TERRA_API_KEY') ?? '';
  if (!devId || !apiKey) return json({ error: 'Terra not configured' }, 500);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

  try {
    // Identify the caller from their JWT — the reference_id we hand Terra must
    // be the real user id, since it is how webhooks get attributed back.
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) return json({ error: 'Unauthorized' }, 401);

    const res = await fetch('https://api.tryterra.co/v2/auth/generateAuthToken', {
      method: 'POST',
      headers: {
        'dev-id': devId,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reference_id: user.id }),
    });

    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.token) {
      console.error('[terra-token] generateAuthToken failed', res.status, body);
      return json({ error: 'Could not create Terra session' }, 502);
    }

    return json({ token: body.token, devId, referenceId: user.id });
  } catch (e) {
    console.error('[terra-token] error', e);
    return json({ error: 'Unexpected error' }, 500);
  }
});

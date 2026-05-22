import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (!req.headers.get('Authorization')) {
    console.error('Missing Authorization header');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const key = Deno.env.get('ANTHROPIC_KEY') ?? '';
  if (!key) {
    console.error('ANTHROPIC_KEY secret is not set');
    return new Response(JSON.stringify({ error: 'ANTHROPIC_KEY not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  console.log('Key found, length:', key.length, 'prefix:', key.slice(0, 14));

  try {
    const body = await req.json();
    console.log('Calling Anthropic, model:', body.model);

    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'output-128k-2025-02-19',
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    console.log('Anthropic status:', response.status, response.ok ? 'OK' : JSON.stringify(data));

    return new Response(JSON.stringify(data), {
      status: response.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Proxy error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

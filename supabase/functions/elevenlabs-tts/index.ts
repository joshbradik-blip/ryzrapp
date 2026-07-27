import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Text-to-speech proxy for ElevenLabs. Keeps the API key server-side (never
// shipped to the client) and returns base64 mp3 the app plays via expo-av.

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_CHARS = 800; // guard against runaway cost per request
const DEFAULT_MODEL = 'eleven_turbo_v2_5'; // fast + cheap, good for coaching lines

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors });
  }

  if (!req.headers.get('Authorization')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const key = Deno.env.get('ELEVENLABS_KEY') ?? '';
  if (!key) {
    console.error('ELEVENLABS_KEY secret is not set');
    return new Response(JSON.stringify({ error: 'ELEVENLABS_KEY not configured' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { text, voice_id, model_id } = await req.json();
    if (!text || !voice_id) {
      return new Response(JSON.stringify({ error: 'text and voice_id are required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const clipped = String(text).slice(0, MAX_CHARS);
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}?output_format=mp3_44100_128`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: clipped,
        model_id: model_id ?? DEFAULT_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('ElevenLabs error:', response.status, detail);
      return new Response(JSON.stringify({ error: `ElevenLabs error ${response.status}` }), {
        status: response.status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    return new Response(JSON.stringify({ audio: toBase64(bytes), mime: 'audio/mpeg' }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('TTS proxy error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

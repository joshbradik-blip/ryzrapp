import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Perfect Corp / YouCam "AI Body Reshape" proxy.
//
// Keeps the API key server-side (same pattern as anthropic-proxy /
// elevenlabs-tts) and hides the upload → create-task → poll dance from the
// client. Two input modes:
//   - image_base64: the client sends the selfie bytes; we stash them in a
//     PRIVATE Storage bucket, hand Perfect Corp a short-lived signed URL, and
//     delete the input again afterwards (the selfie is never left public and
//     never persisted here).
//   - src_file_url: a public/signed URL is passed straight through (used by
//     the standalone test script).
//
// Auth is the simple v2 scheme: Authorization: Bearer <API key>. No RSA /
// id_token handshake is needed for this endpoint.
//
// Docs: https://yce.perfectcorp.com/document/index.html (AI Body Reshape)

const BASE = 'https://yce-api-01.makeupar.com';
const CREATE_URL = `${BASE}/s2s/v2.0/task/body-reshape`;
const POLL_URL = (taskId: string) => `${BASE}/s2s/v2.0/task/body-reshape/${taskId}`;
const BUCKET = 'future-self';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The exact response nesting isn't fully documented, so pull known fields
// from whichever level they land on rather than assuming one shape.
function pick<T = unknown>(obj: any, keys: string[]): T | undefined {
  for (const k of keys) {
    if (obj && obj[k] != null) return obj[k] as T;
    if (obj?.data && obj.data[k] != null) return obj.data[k] as T;
    if (obj?.data?.data && obj.data.data[k] != null) return obj.data.data[k] as T;
  }
  return undefined;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (!req.headers.get('Authorization')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const key = Deno.env.get('PERFECTCORP_API_KEY') ?? '';
  if (!key) {
    console.error('PERFECTCORP_API_KEY secret is not set');
    return json({ error: 'PERFECTCORP_API_KEY not configured' }, 500);
  }

  let payload: {
    image_base64?: string;
    src_file_url?: string;
    features?: Record<string, number>;
    index?: number;
  };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { image_base64, features, index = 0 } = payload;
  if (!features || Object.values(features).every((v) => !v)) {
    // The API rejects an all-zero effect; catch it before spending a credit.
    return json({ error: 'At least one non-zero reshape feature is required' }, 400);
  }

  // Resolve the source image URL — either a stashed selfie or a passed URL.
  let srcFileUrl = payload.src_file_url;
  let cleanup: (() => Promise<void>) | null = null;

  if (image_base64) {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'Storage not configured' }, 500);
    }
    const admin = createClient(supabaseUrl, serviceKey);
    const path = `input/${crypto.randomUUID()}.jpg`;
    const bytes = Uint8Array.from(atob(image_base64), (c) => c.charCodeAt(0));

    const up = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: 'image/jpeg',
      upsert: false,
    });
    if (up.error) {
      console.error('Selfie upload failed:', up.error.message);
      return json({ error: `Upload failed: ${up.error.message}` }, 500);
    }
    const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 600);
    if (signed.error || !signed.data?.signedUrl) {
      await admin.storage.from(BUCKET).remove([path]);
      return json({ error: 'Could not sign selfie URL' }, 500);
    }
    srcFileUrl = signed.data.signedUrl;
    cleanup = async () => {
      await admin.storage.from(BUCKET).remove([path]).catch(() => {});
    };
  }

  if (!srcFileUrl) return json({ error: 'image_base64 or src_file_url is required' }, 400);

  const auth = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    // 1. Create the reshape task.
    const createRes = await fetch(CREATE_URL, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ src_file_url: srcFileUrl, version: '1.0', index, features }),
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      console.error('Create task failed:', createRes.status, JSON.stringify(createData));
      await cleanup?.();
      return json({ error: 'Create task failed', status: createRes.status, upstream: createData }, 502);
    }

    const taskId = pick<string>(createData, ['task_id', 'taskId', 'result_id', 'id']);
    if (!taskId) {
      console.error('No task_id in create response:', JSON.stringify(createData));
      await cleanup?.();
      return json({ error: 'No task_id returned', upstream: createData }, 502);
    }

    // 2. Poll until success/error. Reshape tasks are quick (a few seconds);
    //    cap total wait so we stay well inside the function timeout.
    const MAX_TRIES = 30;
    const INTERVAL_MS = 1500;
    for (let i = 0; i < MAX_TRIES; i++) {
      await sleep(INTERVAL_MS);
      const pollRes = await fetch(POLL_URL(taskId), { headers: auth });
      const pollData = await pollRes.json().catch(() => ({}));
      const statusStr = String(pick<string>(pollData, ['task_status', 'status']) ?? '').toLowerCase();

      if (statusStr === 'success') {
        await cleanup?.();
        const results = pick<unknown>(pollData, ['results', 'result']);
        return json({ status: 'success', task_id: taskId, results, upstream: pollData });
      }
      if (statusStr === 'error' || statusStr === 'failed') {
        console.error('Reshape task errored:', JSON.stringify(pollData));
        await cleanup?.();
        return json({ status: 'error', task_id: taskId, upstream: pollData }, 502);
      }
      // otherwise still running / queued → keep polling
    }

    await cleanup?.();
    return json({ error: 'Timed out waiting for reshape task', task_id: taskId }, 504);
  } catch (err: unknown) {
    await cleanup?.();
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Reshape proxy error:', message);
    return json({ error: message }, 500);
  }
});

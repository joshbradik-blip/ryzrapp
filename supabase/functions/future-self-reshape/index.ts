import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Perfect Corp / YouCam "AI Body Reshape" proxy.
//
// Keeps the API key server-side (same pattern as anthropic-proxy /
// elevenlabs-tts) and hides the create-task → poll dance from the client.
// The client sends a PUBLIC image URL (a full-body selfie already uploaded
// to Supabase Storage) plus a reshape `features` object; we run the task and
// return the reshaped image URL.
//
// Auth is the simple v2 scheme: Authorization: Bearer <API key>. No RSA /
// id_token handshake is needed for this endpoint.
//
// Docs: https://yce.perfectcorp.com/document/index.html (AI Body Reshape)

const BASE = 'https://yce-api-01.makeupar.com';
const CREATE_URL = `${BASE}/s2s/v2.0/task/body-reshape`;
const POLL_URL = (taskId: string) => `${BASE}/s2s/v2.0/task/body-reshape/${taskId}`;

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

  let payload: { src_file_url?: string; features?: Record<string, number>; index?: number };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { src_file_url, features, index = 0 } = payload;
  if (!src_file_url) return json({ error: 'src_file_url is required' }, 400);
  if (!features || Object.values(features).every((v) => !v)) {
    // The API rejects an all-zero effect; catch it before spending a credit.
    return json({ error: 'At least one non-zero reshape feature is required' }, 400);
  }

  const auth = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  try {
    // 1. Create the reshape task.
    const createRes = await fetch(CREATE_URL, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ src_file_url, version: '1.0', index, features }),
    });
    const createData = await createRes.json().catch(() => ({}));
    if (!createRes.ok) {
      console.error('Create task failed:', createRes.status, JSON.stringify(createData));
      return json({ error: 'Create task failed', status: createRes.status, upstream: createData }, 502);
    }

    const taskId = pick<string>(createData, ['task_id', 'taskId', 'result_id', 'id']);
    if (!taskId) {
      console.error('No task_id in create response:', JSON.stringify(createData));
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
        const results = pick<unknown>(pollData, ['results', 'result']);
        return json({ status: 'success', task_id: taskId, results, upstream: pollData });
      }
      if (statusStr === 'error' || statusStr === 'failed') {
        console.error('Reshape task errored:', JSON.stringify(pollData));
        return json({ status: 'error', task_id: taskId, upstream: pollData }, 502);
      }
      // otherwise still running / queued → keep polling
    }

    return json({ error: 'Timed out waiting for reshape task', task_id: taskId }, 504);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Reshape proxy error:', message);
    return json({ error: message }, 500);
  }
});

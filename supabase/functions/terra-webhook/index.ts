// Terra webhook receiver.
//
// Contract Terra imposes (docs: Setting up data destinations → Webhooks):
//   • Respond within 8 SECONDS. Slow responses trip a per-destination circuit
//     breaker that can cascade into dropped events.
//   • Events are retried up to 10 times over ~8h, then DROPPED SILENTLY.
//   • Payloads may arrive in "ping mode" as {type: "s3_payload", url} and must
//     be downloaded separately.
//
// So this endpoint does the minimum: verify, persist the raw envelope, return
// 200. Mapping into health_daily_metrics happens afterwards, off the request
// path, and can be re-run from the stored payload if a mapping turns out wrong.
//
// Secrets:
//   TERRA_SIGNING_SECRET — SECRET, verifies payload authenticity
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Terra allows 8s total; keep the optional S3 fetch well inside that. */
const S3_FETCH_TIMEOUT_MS = 4000;

/**
 * Verify `terra-signature: t=<unix>,v1=<hex>` — HMAC-SHA256 over "<t>.<rawBody>".
 *
 * Must run against the RAW, unaltered body; any reserialization breaks it.
 */
async function verifySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header || !secret) return false;

  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;

  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${t}.${rawBody}`),
  );
  const expected = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare — a plain === leaks timing information.
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const signingSecret = Deno.env.get('TERRA_SIGNING_SECRET') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Read the body exactly once, unparsed — signature verification depends on it.
  const rawBody = await req.text();

  const valid = await verifySignature(rawBody, req.headers.get('terra-signature'), signingSecret);
  if (!valid) {
    // Fail closed. If legitimate events are being rejected, the cause is almost
    // always the signed-payload construction ("<t>.<body>") or a stale secret —
    // check this log rather than loosening the check.
    console.error('[terra-webhook] signature verification failed');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    let payload: Record<string, unknown> = JSON.parse(rawBody);

    // Ping mode: the real payload lives behind a short-lived presigned URL.
    if (payload?.type === 's3_payload' && typeof payload.url === 'string') {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), S3_FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(payload.url, { signal: ctrl.signal });
        if (res.ok) payload = await res.json();
        else console.error('[terra-webhook] s3 payload fetch failed', res.status);
      } catch (e) {
        // Keep the envelope: the URL is logged and the event is not lost, even
        // though the link expires in ~5 minutes.
        console.error('[terra-webhook] s3 payload fetch error', e);
      } finally {
        clearTimeout(timer);
      }
    }

    const user = (payload?.user ?? {}) as Record<string, unknown>;
    const terraUserId = (user.user_id as string) ?? null;
    const referenceId = (user.reference_id as string) ?? null;
    const eventType = (payload?.type as string) ?? null;

    await supabase.from('terra_events_raw').insert({
      terra_user_id: terraUserId,
      // reference_id is the Supabase user id we passed to generateAuthToken.
      user_id: referenceId,
      event_type: eventType,
      payload,
      signature_valid: true,
    });

    // Connection lifecycle events are the only ones handled inline — they are
    // small, always delivered in-body even in ping mode, and establish the
    // mapping every later data event depends on.
    if (eventType === 'auth' && terraUserId && referenceId) {
      await supabase.from('terra_connections').upsert(
        {
          user_id: referenceId,
          terra_user_id: terraUserId,
          provider: (user.provider as string) ?? 'UNKNOWN',
          active: true,
          last_webhook_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,terra_user_id' },
      );
    } else if ((eventType === 'deauth' || eventType === 'user_reauth') && terraUserId) {
      await supabase
        .from('terra_connections')
        .update({ active: eventType !== 'deauth', last_webhook_at: new Date().toISOString() })
        .eq('terra_user_id', terraUserId);
    }
  } catch (e) {
    // Still 200 below: a parsing bug on our side must not make Terra retry for
    // 8 hours and then drop the event. The raw row (or this log) is the record.
    console.error('[terra-webhook] processing error', e);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});

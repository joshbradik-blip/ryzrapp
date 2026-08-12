// Dispatches the post-welcome lifecycle emails (Day 3, 7, 21).
//
// Invoked on a schedule by the `ryzr-drip-dispatch` pg_cron job, which POSTs
// here through pg_net (see the drip migration). Not called by the app.
//
// For each live stage it asks `ryzr_drip_claim` for users who are due. That RPC
// does the claim insert and the due-check in one statement, so the same
// idempotency gate as the welcome email applies: a user who already has a row
// for a campaign can never be claimed again, and only claimed users get sent to.
// A stuck run therefore cannot double-send, at worst it leaves rows `pending`.
//
// Deployed with verify_jwt = false; authenticated by the shared secret header.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend';

import { DRIP_STAGES, dripPayload } from '../_shared/dripEmails.ts';
import { resolveFirstName } from '../_shared/emailLayout.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const resendApiKey = Deno.env.get('RESEND_API_KEY');

if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured');
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
if (!resendApiKey) throw new Error('RESEND_API_KEY is not configured');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const resend = new Resend(resendApiKey);

/** Resend's default limit is 2 requests/second; stay comfortably under it. */
const SEND_INTERVAL_MS = 600;

/** Per stage, per run. Hourly runs make this plenty, and it keeps the
 *  function well inside its wall-clock budget. */
const BATCH_LIMIT = 25;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let cachedSecret: string | null = null;

async function getHookSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const { data, error } = await supabase.rpc('ryzr_welcome_hook_secret');
  if (error) throw new Error(`Could not read hook secret from Vault: ${error.message}`);
  if (!data) throw new Error("Vault secret 'ryzr_welcome_hook_secret' is not set");

  cachedSecret = data as string;
  return cachedSecret;
}

/** Constant-time compare so the secret can't be recovered by timing the endpoint. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;

  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

interface ClaimedUser {
  user_id: string;
  email: string;
  user_metadata: Record<string, unknown> | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const expected = await getHookSecret();
    if (!secretMatches(req.headers.get('x-ryzr-webhook-secret'), expected)) {
      return json({ error: 'Unauthorized' }, 401);
    }
  } catch (error) {
    console.error('Hook secret unavailable:', error);
    return json({ success: false, error: 'Hook secret unavailable' }, 500);
  }

  try {
    const body = await req.json().catch(() => ({}));
    // Lets a run be inspected without sending. Claims are still skipped, so a
    // dry run leaves no trace and can be repeated.
    const dryRun = body?.dryRun === true;
    const onlyStage = typeof body?.stage === 'string' ? body.stage : undefined;

    const summary: Record<string, unknown>[] = [];

    for (const stage of DRIP_STAGES) {
      if (!stage.live) {
        summary.push({ campaign: stage.campaign, skipped: 'stage_not_live' });
        continue;
      }
      if (onlyStage && stage.campaign !== onlyStage) continue;

      if (dryRun) {
        const { data, error } = await supabase.rpc('ryzr_drip_preview', {
          p_campaign: stage.campaign,
          p_after_days: stage.afterDays,
          p_limit: BATCH_LIMIT,
        });
        if (error) throw error;

        summary.push({
          campaign: stage.campaign,
          dryRun: true,
          would_send: (data ?? []).length,
          recipients: data ?? [],
        });
        continue;
      }

      const { data, error } = await supabase.rpc('ryzr_drip_claim', {
        p_campaign: stage.campaign,
        p_after_days: stage.afterDays,
        p_limit: BATCH_LIMIT,
      });
      if (error) throw error;

      const claimed = (data ?? []) as ClaimedUser[];
      let sent = 0;
      let failed = 0;

      for (const user of claimed) {
        const firstName = resolveFirstName(user.user_metadata);

        const { data: result, error: sendError } = await resend.emails.send(
          dripPayload(stage, user.email, firstName),
        );

        if (sendError) {
          failed++;
          // Left as `error` rather than deleted, so a retry is a deliberate act
          // rather than something that happens silently on the next cron tick.
          await supabase
            .from('ryzr_email_campaign_sends')
            .update({ status: 'error', error: JSON.stringify(sendError) })
            .eq('user_id', user.user_id)
            .eq('campaign', stage.campaign);

          console.error(`${stage.campaign} failed for ${user.user_id}:`, sendError);
        } else {
          sent++;
          await supabase
            .from('ryzr_email_campaign_sends')
            .update({
              status: 'sent',
              resend_email_id: result?.id ?? null,
              sent_at: new Date().toISOString(),
              error: null,
            })
            .eq('user_id', user.user_id)
            .eq('campaign', stage.campaign);
        }

        await sleep(SEND_INTERVAL_MS);
      }

      summary.push({ campaign: stage.campaign, claimed: claimed.length, sent, failed });
    }

    console.log('drip dispatch complete', JSON.stringify(summary));
    return json({ success: true, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';
    console.error('send-ryzr-drip error:', message);
    return json({ success: false, error: message }, 500);
  }
});

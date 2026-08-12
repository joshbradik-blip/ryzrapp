// Sends the RYZR welcome email to a single new signup.
//
// Called by the `on_auth_user_welcome_email` trigger on `auth.users` via pg_net
// (see the welcome_email_automation migration), NOT by the app. The trigger has
// already claimed a `ryzr_email_campaign_sends` row in `pending` state before
// this runs, which is what makes double-sends impossible — this function only
// resolves that row to `sent` or `error`.
//
// Deployed with verify_jwt = false, because a Postgres trigger has no user JWT
// to present. Authentication is instead a shared secret header, so the endpoint
// is not open to the internet.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend';

import {
  WELCOME_CAMPAIGN,
  resolveFirstName,
  welcomeEmailPayload,
} from '../_shared/welcomeEmail.ts';

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

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// The trigger and this function share one secret, stored once in Vault. Read it
// through the service-role-only accessor and cache it for the life of the
// isolate, so this costs one query per cold start rather than one per signup.
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

  let userId: string | undefined;

  try {
    const body = await req.json().catch(() => ({}));

    userId = typeof body?.user_id === 'string' ? body.user_id : undefined;
    const email = typeof body?.email === 'string' ? body.email : undefined;

    if (!userId || !email) {
      return json({ success: false, error: 'user_id and email are required' }, 400);
    }

    const firstName = resolveFirstName(body?.user_metadata);

    const { data: sent, error: sendError } = await resend.emails.send(
      welcomeEmailPayload(email, firstName),
    );

    if (sendError) {
      // Leave the row as `error` so the backfill function can retry it later.
      await supabase
        .from('ryzr_email_campaign_sends')
        .update({ status: 'error', error: JSON.stringify(sendError) })
        .eq('user_id', userId)
        .eq('campaign', WELCOME_CAMPAIGN);

      console.error('Resend error for user', userId, sendError);
      return json({ success: false, error: sendError }, 502);
    }

    const { error: logError } = await supabase
      .from('ryzr_email_campaign_sends')
      .update({
        status: 'sent',
        resend_email_id: sent?.id ?? null,
        sent_at: new Date().toISOString(),
        error: null,
      })
      .eq('user_id', userId)
      .eq('campaign', WELCOME_CAMPAIGN);

    // The email is already out the door; a bookkeeping failure is worth logging
    // but not worth reporting as a failed send.
    if (logError) {
      console.error('Sent but failed to record send for user', userId, logError.message);
    }

    console.log('Welcome email sent to', userId, sent?.id);
    return json({ success: true, resend_email_id: sent?.id ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown server error';

    if (userId) {
      try {
        await supabase
          .from('ryzr_email_campaign_sends')
          .update({ status: 'error', error: message })
          .eq('user_id', userId)
          .eq('campaign', WELCOME_CAMPAIGN);
      } catch {
        // Best effort — the original error below is the one that matters.
      }
    }

    console.error('send-welcome-email error:', message);
    return json({ success: false, error: message }, 500);
  }
});

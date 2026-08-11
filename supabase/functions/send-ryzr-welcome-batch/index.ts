// Backfills the RYZR welcome email to users who signed up before the automatic
// trigger existed.
//
// New signups are handled automatically by `send-welcome-email`; this function
// is a one-off catch-up tool, paged so a run can't blow past Resend's rate limit
// in one go. It defaults to a dry run — pass `dryRun: false` to actually send.
//
// Deployed with verify_jwt = true.

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

/** Resend's default limit is 2 requests/second; stay comfortably under it. */
const SEND_INTERVAL_MS = 600;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));

    const limit = Math.min(Number(body?.limit || 10), 100);
    const page = Math.max(Number(body?.page || 1), 1);
    // Opt-in sending: anything other than an explicit `false` stays a dry run.
    const dryRun = body?.dryRun !== false;

    const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers({
      page,
      perPage: limit,
    });
    if (usersError) throw usersError;

    const results: Record<string, unknown>[] = [];

    for (const user of users) {
      if (!user.email) {
        results.push({ user_id: user.id, status: 'skipped', reason: 'no_email' });
        continue;
      }

      const { data: existing, error: existingError } = await supabase
        .from('ryzr_email_campaign_sends')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('campaign', WELCOME_CAMPAIGN)
        .maybeSingle();
      if (existingError) throw existingError;

      // `pending` means the signup trigger has an in-flight send for this user;
      // only previously failed rows are safe to retry here.
      if (existing && existing.status !== 'error') {
        results.push({
          user_id: user.id,
          email: user.email,
          status: 'skipped',
          reason: existing.status === 'pending' ? 'send_in_flight' : 'already_sent',
        });
        continue;
      }

      const firstName = resolveFirstName(user.user_metadata);

      if (dryRun) {
        results.push({ user_id: user.id, email: user.email, firstName, status: 'would_send' });
        continue;
      }

      const { data: sent, error: sendError } = await resend.emails.send(
        welcomeEmailPayload(user.email, firstName),
      );

      if (sendError) {
        results.push({
          user_id: user.id,
          email: user.email,
          status: 'error',
          error: sendError,
        });
        await sleep(SEND_INTERVAL_MS);
        continue;
      }

      const { error: logError } = await supabase
        .from('ryzr_email_campaign_sends')
        .upsert({
          user_id: user.id,
          email: user.email,
          campaign: WELCOME_CAMPAIGN,
          status: 'sent',
          resend_email_id: sent?.id ?? null,
          sent_at: new Date().toISOString(),
          error: null,
        }, { onConflict: 'user_id,campaign' });
      if (logError) throw logError;

      results.push({
        user_id: user.id,
        email: user.email,
        status: 'sent',
        resend_email_id: sent?.id ?? null,
      });

      await sleep(SEND_INTERVAL_MS);
    }

    return json({ success: true, dryRun, page, limit, results });
  } catch (error) {
    console.error('Campaign function error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown server error',
      },
      500,
    );
  }
});

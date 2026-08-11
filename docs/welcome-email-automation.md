# Lifecycle email automation

Sends the RYZR onboarding email sequence automatically, via Supabase + Resend. No
third-party automation service.

| Stage | Timing | Subject | Live |
|---|---|---|---|
| Day 1 | On signup | Welcome to RYZR — Your Free Month is Waiting | ✅ |
| Day 3 | 3 days after signup | Three features most people miss in RYZR | ✅ |
| Day 7 | 7 days after signup | Getting the most out of RYZR | ✅ |
| Day 21 | 21 days after signup | What's coming next in RYZR | ❌ placeholder roadmap |

Day 1 is trigger-driven (there is a signup event to hang it off). Days 3/7/21 are
schedule-driven, because "3 days later" has no event — a pg_cron job runs hourly
and works out who is due.

**Day 21 ships switched off.** Its roadmap section is a placeholder: shipping
promises invented on the user's behalf are the one thing worth refusing to guess
at. Replace `ROADMAP_ITEMS` in `_shared/dripEmails.ts` with real plans, set
`live: true` on that stage, and redeploy.

## How it works

```
user signs up
  └─ auth.users INSERT
       └─ trigger: on_auth_user_welcome_email
            ├─ claims a `pending` row in ryzr_email_campaign_sends
            └─ pg_net POST ──▶ send-welcome-email edge function
                                    ├─ Resend sends the email
                                    └─ marks the row `sent` (or `error`)
```

The claim row is the idempotency gate: `ryzr_email_campaign_sends` has a unique
constraint on `(user_id, campaign)`, and the trigger only calls out to the edge
function if its insert actually created a row. A user can therefore never be
emailed twice, even if the trigger fires again or pg_net retries.

The trigger is wrapped in an exception handler. If Resend is down, the vault
secrets are missing, or anything else goes wrong, it logs a warning and the
signup still succeeds — a welcome email is never allowed to break auth.

## Pieces

| Path | Role |
|---|---|
| `supabase/functions/_shared/emailLayout.ts` | The branded shell all four emails render inside. |
| `supabase/functions/_shared/welcomeEmail.ts` | Day 1 copy. |
| `supabase/functions/_shared/dripEmails.ts` | Day 3 / 7 / 21 copy, timings, and live flags. |
| `supabase/functions/send-welcome-email/` | Day 1 send. Called by the DB trigger. `verify_jwt = false`. |
| `supabase/functions/send-ryzr-drip/` | Day 3/7/21 dispatch. Called by pg_cron. `verify_jwt = false`. |
| `supabase/functions/send-ryzr-email/` | Manual one-off send, for previewing or re-sending. `verify_jwt = true`. |
| `supabase/functions/send-ryzr-welcome-batch/` | Backfill for users who predate automation. `verify_jwt = true`. |
| `supabase/migrations/20260811000000_welcome_email_automation.sql` | Send-log table, pg_net, signup trigger. |
| `supabase/migrations/20260811210000_welcome_email_drip_sequence.sql` | pg_cron, drip config, claim/preview functions. |

## The drip sequence

`ryzr_drip_config` is a single-row table holding two controls:

- **`sequence_start_at`** — only users created at or after this point enter the
  sequence. It was set to the moment the sequence went live, so existing users are
  not retro-drip-fed. Moving it earlier lets more users in; **sent email cannot be
  recalled, so move it earlier deliberately and in small steps.**
- **`enabled`** — the kill switch. `update ryzr_drip_config set enabled = false;`
  stops all drip stages immediately, without touching Day 1.

Preview who is currently due, without sending or claiming anything:

```sql
select * from ryzr_drip_preview('ryzr-drip-day3', 3, 100);
```

Or dry-run the whole dispatcher:

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='ryzr_functions_url')
         || '/functions/v1/send-ryzr-drip',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-ryzr-webhook-secret', (select decrypted_secret from vault.decrypted_secrets
                               where name='ryzr_welcome_hook_secret')),
  body := '{"dryRun":true}'::jsonb
);
-- then read the result:
select status_code, content from net._http_response order by id desc limit 1;
```

The cron job is `ryzr-drip-dispatch`, hourly at :17 (`select * from cron.job`).
Each run claims at most 25 users per stage and paces sends 600ms apart.

## Configuration

All of this is **already provisioned on the live project** — this section
documents what exists and how to reproduce it on a fresh project.

### Secrets

| Where | Name | Purpose |
|---|---|---|
| Edge function secret | `RESEND_API_KEY` | Resend sending key. Project-wide, so all three functions share it. |
| Vault | `ryzr_functions_url` | Project base URL the trigger POSTs to. |
| Vault | `ryzr_welcome_hook_secret` | Shared secret authenticating trigger → `send-welcome-email`. |

The hook secret lives **only in Vault**, not also in a `WELCOME_HOOK_SECRET` env
var. Both ends read the one copy — the trigger directly, the edge function through
the `public.ryzr_welcome_hook_secret()` accessor, which is granted to `service_role`
alone. Two copies that had to be kept identical by hand would be a standing chance
of silently 401ing every welcome email.

To provision on a fresh project, run in the SQL editor:

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'ryzr_functions_url');
select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'ryzr_welcome_hook_secret');
```

Generating the secret inside Postgres means its value never passes through a
shell history, a clipboard, or a chat log. Rotate with `vault.update_secret`;
the edge function caches it per isolate, so a rotation takes effect on the next
cold start (or redeploy to force it).

### Resend

`RESEND_API_KEY` is set as an edge function secret. Note that Resend reveals a
token only once at creation — an existing key whose value you no longer have is
unrecoverable, so create a new one and delete the old rather than trying to
retrieve it.

The sending domain must be verified (Resend → **Domains** → DKIM/SPF records at
your DNS host). Until it is, Resend only delivers to the address on your own
account and 403s everything else. The `from` address is
`josh@bradikenterprises.com`, so `bradikenterprises.com` is the domain in question.

### Deploy

Redeploy after any change to the template or the functions:

```bash
supabase db push
supabase functions deploy send-welcome-email --no-verify-jwt
supabase functions deploy send-ryzr-email
supabase functions deploy send-ryzr-welcome-batch
```

`--no-verify-jwt` on `send-welcome-email` is required: a Postgres trigger has no
user JWT to present. The shared-secret header is what protects that endpoint, and
the function rejects any request without it.

## Verifying

Sign up with a throwaway address, then:

```sql
select email, status, resend_email_id, created_at, sent_at
from ryzr_email_campaign_sends
order by created_at desc
limit 5;
```

`status = 'sent'` with a `resend_email_id` means the whole chain works. If rows
stay `pending`, the edge function isn't being reached — check
`select * from net._http_response order by id desc limit 5;`
and the function logs in the Supabase dashboard.

This was verified end to end on 2026-08-11 by inserting a temporary user, which
produced a `200` from pg_net, a `sent` row with a Resend ID, and a delivered
email. Re-firing the confirmation trigger for that same user produced no second
HTTP call and no second email, confirming the idempotency gate. The test user was
then deleted.

## Backfilling existing users

New signups are automatic. Everyone who signed up earlier needs the batch function.
It is **dry-run by default**:

```bash
# preview
curl -X POST https://<project-ref>.supabase.co/functions/v1/send-ryzr-welcome-batch \
  -H "Authorization: Bearer <anon-key>" \
  -H "Content-Type: application/json" \
  -d '{"page": 1, "limit": 25}'

# actually send
  -d '{"page": 1, "limit": 25, "dryRun": false}'
```

Work through pages until a page returns no `would_send` results.

> **Before backfilling:** if you already blasted these users from the Resend
> dashboard, the batch function has no way to know — its send log was empty at the
> time. Mark them as sent first so they don't get a duplicate:
>
> ```sql
> insert into ryzr_email_campaign_sends (user_id, email, campaign, status, sent_at)
> select id, email, 'ryzr-free-month-2026', 'sent', now()
> from auth.users
> where email is not null
>   and created_at < '<date of your manual blast>'
> on conflict (user_id, campaign) do nothing;
> ```

## Editing the email

Change `buildWelcomeEmail()` in `supabase/functions/_shared/welcomeEmail.ts`, then
redeploy all three functions — each bundles its own copy of the shared module.

Two rules when pulling copy over from a Resend **Broadcast**:

1. **Broadcast merge tags do not work here.** Resend expands `{{{...}}}` tags in
   its Broadcast pipeline, not in the transactional send API. Pasted verbatim they
   reach the recipient as literal `{{{contact.first_name|there}}}` text. The two
   tags in the original broadcast are already translated — the first name is
   interpolated from signup metadata, and `{{{RESEND_UNSUBSCRIBE_URL}}}` became a
   `mailto:` unsubscribe.
2. **Keep the first name escaped.** It comes from user-supplied signup metadata.

### Unsubscribe

Broadcasts get a hosted one-click unsubscribe URL from Resend; transactional sends
don't. The footer link and the `List-Unsubscribe` header both point at a `mailto:`,
which you honour by hand. That's proportionate at current volume, but if this email
ever goes out in bulk, the follow-up is a suppression table checked before each send
plus an HTTPS endpoint for true one-click unsubscribe.

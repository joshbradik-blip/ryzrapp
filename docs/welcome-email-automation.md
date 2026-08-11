# Welcome email automation

Sends the RYZR welcome email (free-month promo + feedback ask) automatically when
someone signs up, via Supabase + Resend. No third-party automation service.

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
| `supabase/functions/_shared/welcomeEmail.ts` | The email template. Single source of truth — edit the copy here. |
| `supabase/functions/send-welcome-email/` | Automatic per-signup send. Called by the DB trigger. `verify_jwt = false`. |
| `supabase/functions/send-ryzr-email/` | Manual one-off send, for previewing or re-sending. `verify_jwt = true`. |
| `supabase/functions/send-ryzr-welcome-batch/` | Backfill for users who signed up before automation existed. `verify_jwt = true`. |
| `supabase/migrations/20260811000000_welcome_email_automation.sql` | Send-log table, pg_net, trigger. |

## Setup

### 1. Resend API key

`RESEND_API_KEY` is most likely **already set** — the existing `send-ryzr-email`
function reads it, throws at boot without it, and has sent successfully. Supabase
secrets are project-wide, so every function here inherits the same key. Check with:

```bash
supabase secrets list
```

If it's missing, note that Resend reveals a token only once at creation, so an
existing key whose value you no longer have is unrecoverable — create a new one
(resend.com → **API Keys** → **Create API Key** → permission **Sending access**)
and delete the old one.

Your sending domain also needs to be verified (Resend → **Domains** → add the
DKIM/SPF records at your DNS host). Until it is, Resend only delivers to the
address on your own account — everything else 403s. The `from` address is
`josh@bradikenterprises.com`, so `bradikenterprises.com` is the domain in question.

### 2. Set the remaining secret

```bash
# Shared secret authenticating the DB trigger to send-welcome-email.
# Generate a fresh random one — this value is never committed.
supabase secrets set WELCOME_HOOK_SECRET="$(openssl rand -hex 32)"
```

### 3. Store the trigger's copies in Vault

Postgres needs the same shared secret, plus the project URL, to make the call.
Run this in the Supabase SQL editor, substituting the **same** `WELCOME_HOOK_SECRET`
value from step 2:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co',
  'ryzr_functions_url'
);

select vault.create_secret(
  '<the same WELCOME_HOOK_SECRET value>',
  'ryzr_welcome_hook_secret'
);
```

To rotate later, use `vault.update_secret` and re-run `supabase secrets set`.

### 4. Deploy

```bash
supabase db push
supabase functions deploy send-welcome-email --no-verify-jwt
supabase functions deploy send-ryzr-email
supabase functions deploy send-ryzr-welcome-batch
```

`--no-verify-jwt` on `send-welcome-email` is required: a Postgres trigger has no
user JWT to present. The shared-secret header is what protects that endpoint, and
the function rejects any request without it.

### 5. Verify

Sign up with a throwaway address in the app, then:

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

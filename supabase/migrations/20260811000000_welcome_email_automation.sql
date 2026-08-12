-- Welcome email automation
--
-- Fires the RYZR welcome email automatically when a user signs up, replacing the
-- manual "export a CSV and blast it from the Resend dashboard" step.
--
-- Flow:
--   auth.users insert
--     -> ryzr_send_welcome_email() trigger
--     -> claims a `pending` row in ryzr_email_campaign_sends (idempotency gate)
--     -> pg_net POSTs to the send-welcome-email edge function
--     -> that function resolves the row to `sent` or `error`
--
-- The claim happens in the same transaction as the signup, so even if pg_net
-- retries or the trigger somehow fires twice, only the first attempt gets past
-- the unique constraint and only one email goes out.

-- pg_net gives Postgres async HTTP. Supabase ships it but leaves it uninstalled.
-- It is not relocatable: its functions always land in the `net` schema, so no
-- WITH SCHEMA clause here.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- Send log
-- ---------------------------------------------------------------------------
-- Referenced by send-welcome-email and send-ryzr-welcome-batch. Both were
-- written against this table before it existed, so the batch function has never
-- successfully run.
CREATE TABLE IF NOT EXISTS ryzr_email_campaign_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  campaign text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'error')),
  resend_email_id text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (user_id, campaign)
);

CREATE INDEX IF NOT EXISTS ryzr_email_campaign_sends_campaign_status_idx
  ON ryzr_email_campaign_sends (campaign, status);

-- Send history is operator-only. No policies are defined, so RLS denies every
-- client; the edge functions reach it with the service role, which bypasses RLS.
ALTER TABLE ryzr_email_campaign_sends ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Shared secret accessor
-- ---------------------------------------------------------------------------
-- Both ends of the trigger -> edge function call need the same secret. Keeping
-- the single copy in Vault (rather than a Vault copy plus a WELCOME_HOOK_SECRET
-- env var that must be kept identical by hand) removes the chance of the two
-- drifting apart and silently 401ing every welcome email.
--
-- PostgREST only exposes the `public` schema, so the edge function reaches the
-- Vault entry through this wrapper. Execute is granted to service_role alone,
-- which can already read anything in the database.
CREATE OR REPLACE FUNCTION public.ryzr_welcome_hook_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret
    FROM vault.decrypted_secrets
   WHERE name = 'ryzr_welcome_hook_secret';
$$;

REVOKE ALL ON FUNCTION public.ryzr_welcome_hook_secret() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ryzr_welcome_hook_secret() TO service_role;

-- ---------------------------------------------------------------------------
-- Signup trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ryzr_send_welcome_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_campaign  constant text := 'ryzr-free-month-2026';
  v_functions_url text;
  v_hook_secret   text;
  v_claimed       integer;
BEGIN
  -- Everything below is best-effort. A welcome email is never worth failing a
  -- signup over, so any error here is downgraded to a warning in the logs.
  BEGIN
    IF new.email IS NULL THEN
      RETURN new;
    END IF;

    -- On INSERT: send right away (RYZR has email confirmation disabled, so users
    -- arrive already confirmed). On UPDATE: only when confirmation just landed,
    -- which covers the case where confirmation gets switched on later.
    --
    -- OLD is unassigned in an INSERT trigger and reading it raises, so it must
    -- stay inside this branch rather than being folded into one condition — SQL
    -- does not guarantee short-circuit evaluation of AND.
    IF TG_OP = 'UPDATE' THEN
      IF NOT (old.email_confirmed_at IS NULL AND new.email_confirmed_at IS NOT NULL) THEN
        RETURN new;
      END IF;
    END IF;

    SELECT decrypted_secret INTO v_functions_url
      FROM vault.decrypted_secrets WHERE name = 'ryzr_functions_url';

    SELECT decrypted_secret INTO v_hook_secret
      FROM vault.decrypted_secrets WHERE name = 'ryzr_welcome_hook_secret';

    IF v_functions_url IS NULL OR v_hook_secret IS NULL THEN
      RAISE WARNING 'ryzr_send_welcome_email: vault secrets missing, skipping send for %', new.id;
      RETURN new;
    END IF;

    -- Idempotency gate: claim the send, and bail out if someone already has.
    INSERT INTO public.ryzr_email_campaign_sends (user_id, email, campaign, status)
    VALUES (new.id, new.email, v_campaign, 'pending')
    ON CONFLICT (user_id, campaign) DO NOTHING;

    GET DIAGNOSTICS v_claimed = ROW_COUNT;
    IF v_claimed = 0 THEN
      RETURN new;
    END IF;

    PERFORM net.http_post(
      url     := v_functions_url || '/functions/v1/send-welcome-email',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ryzr-webhook-secret', v_hook_secret
      ),
      body    := jsonb_build_object(
        'user_id', new.id,
        'email', new.email,
        'user_metadata', coalesce(new.raw_user_meta_data, '{}'::jsonb)
      ),
      timeout_milliseconds := 5000
    );

  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'ryzr_send_welcome_email failed for %: %', new.id, SQLERRM;
  END;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_welcome_email ON auth.users;
CREATE TRIGGER on_auth_user_welcome_email
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ryzr_send_welcome_email();

DROP TRIGGER IF EXISTS on_auth_user_confirmed_welcome_email ON auth.users;
CREATE TRIGGER on_auth_user_confirmed_welcome_email
  AFTER UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.ryzr_send_welcome_email();

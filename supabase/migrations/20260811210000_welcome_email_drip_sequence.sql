-- Lifecycle email sequence (Day 3 / 7 / 21)
--
-- Day 1 is the welcome email, already sent by the auth.users trigger. This adds
-- the later stages, dispatched on a schedule rather than by a trigger, because
-- "3 days after signup" is a time-based condition with no event to hang off.
--
-- Flow:
--   pg_cron (hourly)
--     -> public.ryzr_drip_dispatch()
--     -> pg_net POST to the send-ryzr-drip edge function
--     -> that function calls ryzr_drip_claim() per stage and sends
--
-- Reuses ryzr_email_campaign_sends for idempotency: one row per (user, campaign),
-- claimed before sending, so a stage can never go out twice to the same user.

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------
-- Single-row table (the `id boolean PRIMARY KEY CHECK (id)` trick allows exactly
-- one row, so there is no ambiguity about which config is in force).
CREATE TABLE IF NOT EXISTS ryzr_drip_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  -- Only users created at or after this point enter the sequence. Set to the
  -- moment the sequence went live so existing users are not retro-drip-fed.
  -- Moving it earlier lets more users in; sent email cannot be recalled, so
  -- move it earlier deliberately and in small steps.
  sequence_start_at timestamptz NOT NULL DEFAULT now(),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ryzr_drip_config ENABLE ROW LEVEL SECURITY;

INSERT INTO ryzr_drip_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Due / claim
-- ---------------------------------------------------------------------------
-- Read-only view of who would be sent to. Used by the dispatcher's dry run.
CREATE OR REPLACE FUNCTION public.ryzr_drip_preview(
  p_campaign   text,
  p_after_days integer,
  p_limit      integer DEFAULT 25
)
RETURNS TABLE (user_id uuid, email text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
DECLARE
  v_cutoff  timestamptz;
  v_enabled boolean;
BEGIN
  SELECT c.sequence_start_at, c.enabled INTO v_cutoff, v_enabled
    FROM public.ryzr_drip_config c WHERE c.id;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.id, u.email::text, u.created_at
    FROM auth.users u
   WHERE u.email IS NOT NULL
     AND u.created_at >= v_cutoff
     AND u.created_at <= now() - make_interval(days => p_after_days)
     AND NOT EXISTS (
       SELECT 1 FROM public.ryzr_email_campaign_sends s
        WHERE s.user_id = u.id AND s.campaign = p_campaign
     )
   ORDER BY u.created_at
   LIMIT p_limit;
END;
$fn$;

-- Claims a batch and returns only what was actually claimed. The due-check and
-- the claim happen in one statement, so two concurrent dispatch runs cannot both
-- claim the same user — the second loses the ON CONFLICT race and gets nothing.
CREATE OR REPLACE FUNCTION public.ryzr_drip_claim(
  p_campaign   text,
  p_after_days integer,
  p_limit      integer DEFAULT 25
)
RETURNS TABLE (user_id uuid, email text, user_metadata jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $fn$
-- RETURNS TABLE declares user_id/email/user_metadata as PL/pgSQL variables, which
-- collide with the identically-named columns below. ON CONFLICT targets cannot be
-- table-qualified, so qualification alone can't disambiguate; resolve name clashes
-- to the column, which is what every reference here means.
--
-- ryzr_drip_preview avoids this only because every reference in it happens to be
-- table-qualified — worth remembering before adding an unqualified one there.
#variable_conflict use_column
DECLARE
  v_cutoff  timestamptz;
  v_enabled boolean;
BEGIN
  SELECT c.sequence_start_at, c.enabled INTO v_cutoff, v_enabled
    FROM public.ryzr_drip_config c WHERE c.id;

  IF NOT COALESCE(v_enabled, false) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT u.id, u.email::text AS email,
           COALESCE(u.raw_user_meta_data, '{}'::jsonb) AS meta
      FROM auth.users u
     WHERE u.email IS NOT NULL
       AND u.created_at >= v_cutoff
       AND u.created_at <= now() - make_interval(days => p_after_days)
       AND NOT EXISTS (
         SELECT 1 FROM public.ryzr_email_campaign_sends s
          WHERE s.user_id = u.id AND s.campaign = p_campaign
       )
     ORDER BY u.created_at
     LIMIT p_limit
  ),
  claimed AS (
    INSERT INTO public.ryzr_email_campaign_sends (user_id, email, campaign, status)
    SELECT d.id, d.email, p_campaign, 'pending' FROM due d
    ON CONFLICT (user_id, campaign) DO NOTHING
    RETURNING ryzr_email_campaign_sends.user_id AS uid
  )
  SELECT d.id, d.email, d.meta
    FROM claimed c
    JOIN due d ON d.id = c.uid;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ryzr_drip_preview(text, integer, integer)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.ryzr_drip_claim(text, integer, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ryzr_drip_preview(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.ryzr_drip_claim(text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Scheduled dispatch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ryzr_drip_dispatch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
DECLARE
  v_functions_url text;
  v_hook_secret   text;
BEGIN
  SELECT decrypted_secret INTO v_functions_url
    FROM vault.decrypted_secrets WHERE name = 'ryzr_functions_url';

  SELECT decrypted_secret INTO v_hook_secret
    FROM vault.decrypted_secrets WHERE name = 'ryzr_welcome_hook_secret';

  IF v_functions_url IS NULL OR v_hook_secret IS NULL THEN
    RAISE WARNING 'ryzr_drip_dispatch: vault secrets missing, skipping run';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_functions_url || '/functions/v1/send-ryzr-drip',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ryzr-webhook-secret', v_hook_secret
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
END;
$fn$;

-- Hourly at :17 — off the hour so it isn't competing with everything else that
-- runs at :00. Stages are day-granular, so the exact minute is irrelevant.
SELECT cron.unschedule('ryzr-drip-dispatch')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ryzr-drip-dispatch');

SELECT cron.schedule(
  'ryzr-drip-dispatch',
  '17 * * * *',
  $cron$SELECT public.ryzr_drip_dispatch();$cron$
);

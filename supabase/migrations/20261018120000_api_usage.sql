-- Claude API usage + cost telemetry (see src/lib/usage.ts).
--
-- One row per API call, written client-side from the callAnthropic /
-- callWorkoutCoach choke points. Lets real per-feature cost be read off the
-- dashboard instead of estimated from max_tokens.
--
-- Trust: the client writes these, because only the client knows which feature
-- made the call (the proxy sees a model and a message array). A determined
-- user could therefore forge a row. This is owner-facing cost telemetry, not
-- billing — do not charge money off this table without moving the write into
-- the edge function.

CREATE TABLE IF NOT EXISTS public.api_usage (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Null for a signed-out call. ON DELETE SET NULL so deleting an account
  -- keeps the cost history (it is aggregate spend, not personal data).
  user_id            UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  feature            TEXT NOT NULL,          -- 'plan_generation', 'nutrition_photo', ...
  model              TEXT NOT NULL,
  input_tokens       INT NOT NULL DEFAULT 0,
  output_tokens      INT NOT NULL DEFAULT 0,
  cache_read_tokens  INT NOT NULL DEFAULT 0,
  cache_write_tokens INT NOT NULL DEFAULT 0,
  -- Null when the model is not in the pricing table in src/lib/usage.ts, so an
  -- unpriced model shows as unknown rather than as free.
  cost_usd           NUMERIC(12,6),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The dashboard queries group by feature over a date range.
CREATE INDEX IF NOT EXISTS api_usage_created_at ON public.api_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_feature_created ON public.api_usage (feature, created_at DESC);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

-- A signed-in user may write their own rows and read nothing. There is
-- deliberately no SELECT policy: this is owner telemetry, read from the
-- dashboard and SQL editor via service_role, which bypasses RLS. Without a
-- SELECT policy the table is write-only to the app, so one user can never
-- read another's activity.
DROP POLICY IF EXISTS "api_usage insert own" ON public.api_usage;
CREATE POLICY "api_usage insert own"
  ON public.api_usage
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Signed-out calls (the Welcome screen's) write a null user_id.
DROP POLICY IF EXISTS "api_usage insert anon" ON public.api_usage;
CREATE POLICY "api_usage insert anon"
  ON public.api_usage
  FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- Run this in your Supabase project: Dashboard > SQL Editor > New query
--
-- Wearable / health-hub sync storage:
--   1. health_daily_metrics — one row per user per local calendar day, upserted
--      from Apple Health / Health Connect (steps, heart, sleep, activity).
--   2. body_measurements gains smart-scale columns (lean mass) + a source tag
--      so wearable-synced readings are distinguishable from manual tape logs.

-- ── 1. Daily wearable metrics ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS health_daily_metrics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date             DATE NOT NULL,
  steps            INTEGER,
  resting_hr       INTEGER,          -- bpm, daily average
  hrv_ms           NUMERIC(6,1),     -- SDNN (iOS) / RMSSD (Android), daily average
  sleep_minutes    INTEGER,          -- asleep time for the night ending this day
  active_calories  INTEGER,          -- kcal
  distance_meters  INTEGER,          -- walking + running
  exercise_minutes INTEGER,
  source           TEXT NOT NULL DEFAULT 'apple_health'
                     CHECK (source IN ('apple_health', 'health_connect')),
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upsert key: one row per user per day (client uses onConflict: 'user_id,date')
CREATE UNIQUE INDEX IF NOT EXISTS health_daily_metrics_user_date
  ON health_daily_metrics (user_id, date);

ALTER TABLE health_daily_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_health_metrics" ON health_daily_metrics;
CREATE POLICY "users_own_health_metrics"
  ON health_daily_metrics
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 2. Body measurements: smart-scale columns ────────────────────────────────
-- (Table already exists in production; CREATE IF NOT EXISTS documents its shape
-- for fresh projects, then the ALTERs upgrade existing databases.)
CREATE TABLE IF NOT EXISTS body_measurements (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weight_kg    NUMERIC(5,1),
  neck_cm      NUMERIC(5,1),
  waist_cm     NUMERIC(5,1),
  hip_cm       NUMERIC(5,1),
  body_fat_pct NUMERIC(4,1)
);

ALTER TABLE body_measurements ADD COLUMN IF NOT EXISTS lean_mass_kg NUMERIC(5,1);
ALTER TABLE body_measurements ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_body_measurements" ON body_measurements;
CREATE POLICY "users_own_body_measurements"
  ON body_measurements
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

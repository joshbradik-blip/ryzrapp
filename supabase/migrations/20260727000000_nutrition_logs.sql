-- Run this in your Supabase project: Dashboard > SQL Editor > New query
--
-- Nutrition logging: one row per logged food item. Daily calorie + macro
-- targets are derived client-side from the user's profile/goal (see
-- src/lib/nutrition.ts), so no targets table is needed yet — this stores only
-- what the user actually ate.

CREATE TABLE IF NOT EXISTS nutrition_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logged_on  DATE NOT NULL,                       -- local calendar day the item belongs to
  meal       TEXT NOT NULL DEFAULT 'snack'
               CHECK (meal IN ('breakfast', 'lunch', 'dinner', 'snack')),
  name       TEXT NOT NULL,
  calories   INTEGER NOT NULL DEFAULT 0 CHECK (calories >= 0),
  protein_g  NUMERIC(6,1) NOT NULL DEFAULT 0 CHECK (protein_g >= 0),
  carbs_g    NUMERIC(6,1) NOT NULL DEFAULT 0 CHECK (carbs_g >= 0),
  fat_g      NUMERIC(6,1) NOT NULL DEFAULT 0 CHECK (fat_g >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of a user's entries for a given day.
CREATE INDEX IF NOT EXISTS nutrition_logs_user_day
  ON nutrition_logs (user_id, logged_on);

ALTER TABLE nutrition_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_nutrition_logs" ON nutrition_logs;
CREATE POLICY "users_own_nutrition_logs"
  ON nutrition_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

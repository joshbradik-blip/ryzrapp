-- Run this in your Supabase project: Dashboard > SQL Editor > New query
--
-- Cache for the usda-lookup edge function. Maps a normalized food query
-- (+ cooked/raw state) to the USDA FoodData Central entry we matched, with
-- per-100g nutrition. Pinning the match keeps repeat photos of the same meal
-- on identical numbers and keeps us well under the FDC rate limit.
--
-- Only the edge function (service role) reads/writes this. RLS is enabled with
-- NO policies, so the anon/authenticated roles cannot touch it.

CREATE TABLE IF NOT EXISTS food_lookup_cache (
  cache_key   TEXT PRIMARY KEY,               -- "<normalized query>|<cooked|raw|prepared>"
  fdc_id      INTEGER NOT NULL,
  description TEXT NOT NULL,
  data_type   TEXT NOT NULL,
  calories    NUMERIC(7,1) NOT NULL CHECK (calories >= 0),   -- per 100 g
  protein_g   NUMERIC(6,1) NOT NULL CHECK (protein_g >= 0),
  carbs_g     NUMERIC(6,1) NOT NULL CHECK (carbs_g >= 0),
  fat_g       NUMERIC(6,1) NOT NULL CHECK (fat_g >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE food_lookup_cache ENABLE ROW LEVEL SECURITY;

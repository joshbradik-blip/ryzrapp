-- More affiliate gear for Store > Gear, plus the post-workout "Refuel" picks
-- and the remote switch for free-tier post-workout ads.
--
-- 'Recovery & Fuel' rows feed the Refuel card on the workout-complete screen
-- (src/lib/gear.ts REFUEL_SECTION). One random active row is shown per workout.
--
-- ASINs were taken from third-party listing trackers, not amazon.com itself —
-- open https://www.amazon.com/dp/<ASIN> for each before relying on it, and fix
-- or deactivate any that don't match in the Table Editor.

INSERT INTO gear_products (section, name, description, asin, icon, sort_order) VALUES
  ('Training Gear',    'Mini Loop Bands (Set of 5)',     'Five resistance levels for glute activation, warmups, and mobility — packs into any gym bag.',            'B01AVDVHTI', 'ellipse-outline',   6),
  ('Training Gear',    'Lifting Straps',                 'Padded cotton straps that take grip out of the equation on heavy deadlifts, rows, and shrugs.',          'B07BB3VQ42', 'link-outline',      7),
  ('Training Gear',    'High-Density Foam Roller',       'Firm 18" roller for post-workout recovery on quads, lats, and upper back.',                              'B00XM2MXK8', 'reload-outline',    8),
  ('Recovery & Fuel',  'Creatine Monohydrate',           'Micronized, unflavored, 5 g per serving — the most-researched supplement for strength and power.',       'B00GL2HMES', 'flash-outline',     10),
  ('Recovery & Fuel',  'Whey Protein',                   '24 g of protein per scoop to help hit your daily target and recover between sessions.',                  'B002DYIZH6', 'nutrition-outline', 11),
  ('Recovery & Fuel',  'Shaker Bottle',                  'Leak-proof 28 oz shaker with a whisk ball — no clumps in your post-workout shake.',                      'B01LZQ8OYE', 'water-outline',     12)
ON CONFLICT (asin) DO NOTHING;

-- Free-tier interstitial after a completed workout (src/lib/ads.ts).
-- Set to false in the dashboard to stop every install from showing ads.
INSERT INTO public.app_config (key, value)
VALUES ('post_workout_ads_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

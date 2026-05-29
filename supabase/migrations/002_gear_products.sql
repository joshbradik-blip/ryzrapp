-- Affiliate gear products shown on the Store > Gear tab.
-- Editable from the Supabase dashboard (Table Editor) with no app rebuild:
-- add/edit/remove a row and it appears in the app on next open.

CREATE TABLE IF NOT EXISTS gear_products (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section      TEXT NOT NULL,              -- group heading, e.g. 'Form Coach Setup'
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  asin         TEXT NOT NULL,             -- Amazon product code; link tag is added in-app
  icon         TEXT NOT NULL DEFAULT 'bag-outline', -- Ionicons name
  sort_order   INT  NOT NULL DEFAULT 0,   -- lower = shown first
  is_active    BOOLEAN NOT NULL DEFAULT TRUE, -- uncheck to hide without deleting
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS gear_products_asin_unique ON gear_products (asin);

-- Reuse the shared updated_at trigger function (created in 001).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS gear_products_updated_at ON gear_products;
CREATE TRIGGER gear_products_updated_at
  BEFORE UPDATE ON gear_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row-level security: gear is public, read-only from the app.
-- Writes happen only via the dashboard (service role bypasses RLS).
ALTER TABLE gear_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gear_products_public_read" ON gear_products;
CREATE POLICY "gear_products_public_read"
  ON gear_products
  FOR SELECT
  USING (is_active = TRUE);

-- Seed starter products (idempotent).
INSERT INTO gear_products (section, name, description, asin, icon, sort_order) VALUES
  ('Form Coach Setup', 'Adjustable Phone Tripod',     'Extends to 67" for full-body lifts, with a wireless remote so you can start and stop recording hands-free.', 'B09PH9PNYY', 'phone-portrait-outline', 1),
  ('Form Coach Setup', 'Tripod with Ring Light',      'A full-height stand plus an even ring light in one — clear, well-lit Form Coach footage in any room.',      'B0CW9MSMK4', 'sunny-outline',          2),
  ('Form Coach Setup', 'Flexible Gripping Mount',     'Bendable legs wrap around a squat rack or pole to film from any angle, hands-free.',                        'B07837W5NX', 'git-branch-outline',     3),
  ('Training Gear',    'Resistance Bands Set',        'Five resistance levels with handles and a door anchor — progressive load for warmups and accessory work.',  'B0C37RKB5T', 'infinite-outline',       4),
  ('Training Gear',    'Large Workout Mat',           'Big, non-slip, shoe-friendly surface — doubles as a clean recording area for Form Coach.',                  'B084H4Q8VJ', 'square-outline',         5)
ON CONFLICT (asin) DO NOTHING;

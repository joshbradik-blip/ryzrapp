-- Predesigned workout programs for the focused sections on the Today tab
-- (Flexibility, Balance, Strength, ...). See src/lib/programs.ts.
--
-- Content lives here rather than in src/constants/ so programs can be added,
-- retuned or retired from the Supabase dashboard (Table Editor) with no build
-- and no OTA update — the same arrangement as gear_products.
--
-- Two tables:
--   workout_programs            one row per program ("Hamstring Reset")
--   workout_program_exercises   its exercises, in order
--
-- `exercise_id` points at an entry in src/constants/exercises.ts. That list is
-- compiled into the app, so an id the installed build does not know is simply
-- skipped (see src/lib/programs.ts). A program whose exercises ALL fail to
-- resolve is dropped rather than shown empty. This is what makes the table
-- safe to edit against older installs still in the wild.

-- ---------------------------------------------------------------- programs --

CREATE TABLE IF NOT EXISTS public.workout_programs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           TEXT NOT NULL,               -- stable key, e.g. 'hamstring-reset'
  category       TEXT NOT NULL,               -- section heading, e.g. 'Flexibility'
  name           TEXT NOT NULL,
  description    TEXT NOT NULL,               -- one or two lines, shown on the card
  goal           TEXT,                        -- the specific outcome, e.g. 'Looser hamstrings'
  difficulty     TEXT NOT NULL DEFAULT 'beginner'
                 CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  duration_min   INT  NOT NULL DEFAULT 20 CHECK (duration_min > 0),
  equipment      TEXT[] NOT NULL DEFAULT '{}', -- [] means bodyweight / nothing needed
  icon           TEXT NOT NULL DEFAULT 'body-outline',  -- Ionicons name
  sort_order     INT  NOT NULL DEFAULT 0,      -- lower = shown first, within category
  -- Not read by the app today: everything is free, and premium is "no ads"
  -- (src/lib/ads.ts). Kept so a single program can be gated later from the
  -- dashboard without a migration. Leave FALSE unless that changes.
  is_premium     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE, -- uncheck to hide without deleting
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workout_programs_slug_unique
  ON public.workout_programs (slug);

-- The app lists by category, then sort_order.
CREATE INDEX IF NOT EXISTS workout_programs_category_order
  ON public.workout_programs (category, sort_order)
  WHERE is_active = TRUE;

-- --------------------------------------------------------------- exercises --

CREATE TABLE IF NOT EXISTS public.workout_program_exercises (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id     UUID NOT NULL REFERENCES public.workout_programs (id) ON DELETE CASCADE,
  exercise_id    TEXT NOT NULL,               -- matches an id in src/constants/exercises.ts
  position       INT  NOT NULL,               -- 1-based order within the program
  target_sets    INT  NOT NULL DEFAULT 3 CHECK (target_sets > 0),
  target_reps    TEXT NOT NULL DEFAULT '10',  -- free text: '10', '8-12', '30s hold'
  target_rpe     NUMERIC(3,1) CHECK (target_rpe IS NULL OR (target_rpe >= 1 AND target_rpe <= 10)),
  rest_seconds   INT  NOT NULL DEFAULT 60 CHECK (rest_seconds >= 0),
  notes          TEXT,                        -- shown under the exercise in-session
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS workout_program_exercises_position_unique
  ON public.workout_program_exercises (program_id, position);

CREATE INDEX IF NOT EXISTS workout_program_exercises_program
  ON public.workout_program_exercises (program_id, position);

-- ----------------------------------------------------------------- updated --

-- Reuse the shared trigger function (created in 001, redefined in 002).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workout_programs_updated_at ON public.workout_programs;
CREATE TRIGGER workout_programs_updated_at
  BEFORE UPDATE ON public.workout_programs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS workout_program_exercises_updated_at ON public.workout_program_exercises;
CREATE TRIGGER workout_program_exercises_updated_at
  BEFORE UPDATE ON public.workout_program_exercises
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --------------------------------------------------------------------- RLS --

-- Public, read-only. Programs are the same for everyone and carry no user
-- data, so signed-out installs can read them too. There is deliberately NO
-- insert/update/delete policy: only service_role — the dashboard and the SQL
-- editor — can change a program.

ALTER TABLE public.workout_programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workout_programs readable by app" ON public.workout_programs;
CREATE POLICY "workout_programs readable by app"
  ON public.workout_programs
  FOR SELECT
  TO anon, authenticated
  USING (is_active = TRUE);

ALTER TABLE public.workout_program_exercises ENABLE ROW LEVEL SECURITY;

-- An exercise row is readable only when its program is. Without this, the
-- child table would leak the contents of a program hidden by is_active.
DROP POLICY IF EXISTS "workout_program_exercises readable by app" ON public.workout_program_exercises;
CREATE POLICY "workout_program_exercises readable by app"
  ON public.workout_program_exercises
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workout_programs p
      WHERE p.id = workout_program_exercises.program_id
        AND p.is_active = TRUE
    )
  );

-- -------------------------------------------------------------------- seed --

-- Two starter programs, one per category, to prove the shape end to end.
-- Every exercise_id below exists in src/constants/exercises.ts today.
-- Add your own rows in the Table Editor; nothing here is special.

INSERT INTO public.workout_programs
  (slug, category, name, description, goal, difficulty, duration_min, equipment, icon, sort_order)
VALUES
  ('hamstring-reset', 'Flexibility',
   'Hamstring Reset',
   'A short posterior-chain session that builds length through range rather than static holds alone.',
   'Looser, stronger hamstrings', 'beginner', 20, '{}', 'body-outline', 1),
  ('posterior-strength', 'Strength',
   'Posterior Chain Basics',
   'Hip hinge pattern work — the foundation for deadlifting safely and for hamstrings that do not complain.',
   'Stronger hinge, healthier back', 'beginner', 30, '{barbell,dumbbell}', 'barbell-outline', 1)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.workout_program_exercises
  (program_id, exercise_id, position, target_sets, target_reps, target_rpe, rest_seconds, notes)
SELECT p.id, v.exercise_id, v.position, v.target_sets, v.target_reps, v.target_rpe, v.rest_seconds, v.notes
FROM public.workout_programs p
JOIN (VALUES
  ('hamstring-reset',    'rdl',          1, 3, '8-10',    6.0, 90, 'Light. Chase the stretch, not the weight.'),
  ('hamstring-reset',    'lunge',        2, 2, '10 each', 6.0, 60, 'Long stride to open the hip flexor.'),
  ('posterior-strength', 'deadlift',     1, 3, '5',       7.0, 150, 'Stop each set while the bar path is still clean.'),
  ('posterior-strength', 'rdl',          2, 3, '8-10',    7.0, 120, NULL),
  ('posterior-strength', 'hip_thrust',   3, 3, '12',      7.0, 90,  'Pause a beat at the top.')
) AS v(slug, exercise_id, position, target_sets, target_reps, target_rpe, rest_seconds, notes)
  ON v.slug = p.slug
ON CONFLICT (program_id, position) DO NOTHING;

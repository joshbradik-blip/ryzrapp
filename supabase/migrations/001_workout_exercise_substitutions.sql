-- Run this in your Supabase project: Dashboard > SQL Editor > New query

CREATE TABLE IF NOT EXISTS workout_exercise_substitutions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workout_id              TEXT NOT NULL,
  original_exercise_id    TEXT NOT NULL,
  substitute_exercise_id  TEXT NOT NULL,
  -- 'local' = from our EXERCISES constant, 'exercisedb' = from ExerciseDB API
  substitute_source       TEXT NOT NULL DEFAULT 'local' CHECK (substitute_source IN ('local', 'exercisedb')),
  -- Full exercise payload stored when source = 'exercisedb' (no local record to join to)
  exercisedb_data         JSONB,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One substitution per original exercise per workout per user
CREATE UNIQUE INDEX IF NOT EXISTS workout_exercise_substitutions_unique
  ON workout_exercise_substitutions (user_id, workout_id, original_exercise_id);

-- Keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER workout_exercise_substitutions_updated_at
  BEFORE UPDATE ON workout_exercise_substitutions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Row-level security: users see and modify only their own rows
ALTER TABLE workout_exercise_substitutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_substitutions"
  ON workout_exercise_substitutions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Timed holds are stored separately from repetitions and lifting volume.
ALTER TABLE public.session_sets
  ADD COLUMN IF NOT EXISTS duration_seconds integer
  CHECK (duration_seconds IS NULL OR duration_seconds > 0);

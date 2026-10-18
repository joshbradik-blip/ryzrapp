// Predesigned workout programs — the focused sections on the Today tab
// (Flexibility, Balance, Strength, ...).
//
// Content lives in the Supabase `workout_programs` and
// `workout_program_exercises` tables (see the migration), so programs can be
// added, retuned or retired from the dashboard with no build and no OTA
// update. Only service_role can write; the app reads.
//
// Two rules make the table safe to edit against installs already in the wild:
//
//   1. `exercise_id` is resolved against src/constants/exercises.ts, which is
//      compiled into each build. An id an older build does not know is
//      skipped rather than crashing it.
//   2. A program left with no resolvable exercises is dropped entirely, so
//      nobody is offered a workout that would open empty.
//
// Failure is always quiet: no network, no table, malformed rows — the caller
// gets an empty list and the section simply does not render. Nothing here can
// block app start.

import { getExerciseById } from '../constants/exercises';
import type { Workout, WorkoutExercise, WorkoutProgram, WorkoutProgramCategory } from '../types';
import { supabase } from './supabase';

/** Shape of a `workout_programs` row, as selected below. */
type ProgramRow = {
  id: string;
  slug: string;
  category: string;
  name: string;
  description: string;
  goal: string | null;
  difficulty: string;
  duration_min: number;
  equipment: string[] | null;
  icon: string;
  is_premium: boolean;
};

/** Shape of a `workout_program_exercises` row, as selected below. */
type ProgramExerciseRow = {
  id: string;
  program_id: string;
  exercise_id: string;
  position: number;
  target_sets: number;
  target_reps: string;
  target_rpe: number | string | null;
  rest_seconds: number;
  notes: string | null;
};

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

function difficultyOf(value: string): WorkoutProgram['difficulty'] {
  return (DIFFICULTIES as readonly string[]).includes(value)
    ? (value as WorkoutProgram['difficulty'])
    : 'beginner';
}

/**
 * Resolve one row against the compiled-in exercise library.
 * Returns null when this build has no such exercise.
 */
function toWorkoutExercise(row: ProgramExerciseRow): WorkoutExercise | null {
  const exercise = getExerciseById(row.exercise_id);
  if (!exercise) return null;
  // Postgres NUMERIC arrives as a string over PostgREST.
  const rpe = row.target_rpe === null ? NaN : Number(row.target_rpe);
  return {
    id: row.id,
    exercise,
    target_sets: row.target_sets,
    target_reps: row.target_reps,
    // The session UI expects a number; 0 reads as "no RPE target".
    target_rpe: Number.isFinite(rpe) ? rpe : 0,
    rest_seconds: row.rest_seconds,
    notes: row.notes ?? undefined,
    order: row.position,
  };
}

function toProgram(row: ProgramRow, exercises: WorkoutExercise[]): WorkoutProgram {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    name: row.name,
    description: row.description,
    goal: row.goal ?? undefined,
    difficulty: difficultyOf(row.difficulty),
    durationMin: row.duration_min,
    equipment: row.equipment ?? [],
    icon: row.icon,
    isPremium: row.is_premium,
    exercises,
  };
}

/**
 * Every active program, in display order, with its exercises resolved.
 *
 * Returns [] on any failure — no table, no network, nothing active. Callers
 * render nothing in that case rather than showing an error.
 */
export async function fetchPrograms(): Promise<WorkoutProgram[]> {
  try {
    const { data: programRows, error: programError } = await supabase
      .from('workout_programs')
      .select('id, slug, category, name, description, goal, difficulty, duration_min, equipment, icon, is_premium')
      .eq('is_active', true)
      .order('category', { ascending: true })
      .order('sort_order', { ascending: true });

    if (programError || !programRows || programRows.length === 0) return [];
    const programs = programRows as ProgramRow[];

    const { data: exerciseRows, error: exerciseError } = await supabase
      .from('workout_program_exercises')
      .select('id, program_id, exercise_id, position, target_sets, target_reps, target_rpe, rest_seconds, notes')
      .in('program_id', programs.map((p) => p.id))
      .order('position', { ascending: true });

    if (exerciseError) return [];

    // Group once, rather than filtering the whole list per program.
    const byProgram = new Map<string, WorkoutExercise[]>();
    for (const row of (exerciseRows ?? []) as ProgramExerciseRow[]) {
      const resolved = toWorkoutExercise(row);
      if (!resolved) continue; // exercise unknown to this build
      const list = byProgram.get(row.program_id);
      if (list) list.push(resolved);
      else byProgram.set(row.program_id, [resolved]);
    }

    return programs
      .map((row) => toProgram(row, byProgram.get(row.id) ?? []))
      // Never offer a program that would open with nothing in it.
      .filter((program) => program.exercises.length > 0);
  } catch {
    return [];
  }
}

/**
 * The same programs, grouped under their category heading. Both the categories
 * and the programs inside them keep the order the table defines, so the
 * dashboard controls how the sections read.
 */
export async function fetchProgramCategories(): Promise<WorkoutProgramCategory[]> {
  const programs = await fetchPrograms();
  const categories: WorkoutProgramCategory[] = [];
  for (const program of programs) {
    const existing = categories.find((c) => c.title === program.category);
    if (existing) existing.programs.push(program);
    else categories.push({ title: program.category, programs: [program] });
  }
  return categories;
}

/**
 * Turn a program into a `Workout` the existing session flow can run, so
 * starting one goes through the same screens, rest timer, set logging and
 * history as a generated plan workout.
 *
 * `week_number`/`day_number` are 0: a program is a standalone session, not a
 * day inside a periodised plan, and the history rows record it as such.
 */
export function programToWorkout(program: WorkoutProgram): Workout {
  return {
    id: program.id,
    name: program.name,
    focus: program.category,
    estimated_duration_min: program.durationMin,
    exercises: program.exercises,
    week_number: 0,
    day_number: 0,
  };
}

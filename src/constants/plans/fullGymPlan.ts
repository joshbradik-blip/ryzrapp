import { Workout, WorkoutExercise } from '../../types';
import { EXERCISES } from '../exercises';

// Hand-authored 4-week / 4-day-per-week program for users with full gym
// access. Split: Lower (squat) / Upper Push / Lower (posterior chain) / Upper
// Pull, repeated 4 times with a light RPE + set progression across weeks.

const byId = (id: string) => EXERCISES.find((e) => e.id === id)!;

let uid = 0;
function we(exerciseId: string, sets: number, reps: string, rpe: number, restSeconds: number, order: number): WorkoutExercise {
  return {
    id: `fg_we_${uid++}`,
    exercise: byId(exerciseId),
    target_sets: sets,
    target_reps: reps,
    target_rpe: rpe,
    rest_seconds: restSeconds,
    order,
  };
}

type ExSpec = { id: string; sets: number; reps: string; rest: number };

const DAY_SPECS: ExSpec[][] = [
  // Day 1 — Lower Body, Squat Focus
  [
    { id: 'squat', sets: 4, reps: '6-8', rest: 150 },
    { id: 'rdl', sets: 3, reps: '8-10', rest: 120 },
    { id: 'lunge', sets: 3, reps: '10/leg', rest: 90 },
    { id: 'hip_thrust', sets: 3, reps: '10', rest: 90 },
    { id: 'plank', sets: 3, reps: '30-45s', rest: 60 },
  ],
  // Day 2 — Upper Body, Push
  [
    { id: 'bench_press', sets: 4, reps: '6-8', rest: 150 },
    { id: 'overhead_press', sets: 3, reps: '8-10', rest: 120 },
    { id: 'tricep_dip', sets: 3, reps: '10-12', rest: 75 },
    { id: 'lateral_raise', sets: 3, reps: '12-15', rest: 60 },
    { id: 'push_up', sets: 2, reps: 'AMRAP', rest: 60 },
  ],
  // Day 3 — Lower Body, Posterior Chain
  [
    { id: 'deadlift', sets: 4, reps: '5', rest: 180 },
    { id: 'bulgarian_split_squat', sets: 3, reps: '8/leg', rest: 100 },
    { id: 'goblet_squat', sets: 3, reps: '10', rest: 90 },
    { id: 'calf_raise', sets: 3, reps: '15', rest: 60 },
    { id: 'deadbug', sets: 3, reps: '10/side', rest: 45 },
  ],
  // Day 4 — Upper Body, Pull
  [
    { id: 'pull_up', sets: 4, reps: '6-8', rest: 150 },
    { id: 'bent_over_row', sets: 3, reps: '8-10', rest: 120 },
    { id: 'lat_pulldown', sets: 3, reps: '10-12', rest: 90 },
    { id: 'face_pull', sets: 3, reps: '12-15', rest: 60 },
    { id: 'bicep_curl', sets: 3, reps: '10-12', rest: 60 },
  ],
];

const DAY_NAMES = [
  'Lower Body — Squat Focus',
  'Upper Body — Push',
  'Lower Body — Posterior Chain',
  'Upper Body — Pull',
];

const DAY_FOCUS = ['legs_glutes', 'chest_shoulders_triceps', 'hamstrings_glutes', 'back_biceps'];

// Light week-to-week progression: RPE climbs, and the day's main lift (first
// exercise) picks up an extra set in the back half of the program.
const WEEK_RPE = [6, 7, 7, 8];
const WEEK_MAIN_SET_BONUS = [0, 0, 1, 1];

function buildFullGymPlan(): Workout[] {
  const plan: Workout[] = [];
  for (let week = 1; week <= 4; week++) {
    for (let day = 1; day <= 4; day++) {
      const spec = DAY_SPECS[day - 1];
      const exercises = spec.map((s, i) =>
        we(
          s.id,
          s.sets + (i === 0 ? WEEK_MAIN_SET_BONUS[week - 1] : 0),
          s.reps,
          WEEK_RPE[week - 1],
          s.rest,
          i
        )
      );
      plan.push({
        id: `fg_w${week}d${day}`,
        name: DAY_NAMES[day - 1],
        focus: DAY_FOCUS[day - 1],
        estimated_duration_min: 50,
        exercises,
        week_number: week,
        day_number: day,
      });
    }
  }
  return plan;
}

export const FULL_GYM_PLAN: Workout[] = buildFullGymPlan();

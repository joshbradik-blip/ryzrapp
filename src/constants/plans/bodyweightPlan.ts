import { Workout, WorkoutExercise } from '../../types';
import { EXERCISES } from '../exercises';

// Hand-authored 4-week / 4-day-per-week program requiring zero equipment.
// Only references exercises with equipment_required: [] in exercises.ts.
// Two full-body templates (A/B) alternate through the week for variety, with
// a light RPE + set progression across the 4 weeks.

const byId = (id: string) => EXERCISES.find((e) => e.id === id)!;

let uid = 0;
function we(exerciseId: string, sets: number, reps: string, rpe: number, restSeconds: number, order: number): WorkoutExercise {
  return {
    id: `bw_we_${uid++}`,
    exercise: byId(exerciseId),
    target_sets: sets,
    target_reps: reps,
    target_rpe: rpe,
    rest_seconds: restSeconds,
    order,
  };
}

type ExSpec = { id: string; sets: number; reps: string; rest: number };

// A — Push + core stability. B — Posterior chain + conditioning.
const DAY_SPECS: ExSpec[][] = [
  [
    { id: 'push_up', sets: 3, reps: '8-12', rest: 60 },
    { id: 'lunge', sets: 3, reps: '10/leg', rest: 60 },
    { id: 'plank', sets: 3, reps: '30-45s', rest: 45 },
    { id: 'deadbug', sets: 3, reps: '10/side', rest: 45 },
    { id: 'mountain_climber', sets: 3, reps: '20 total', rest: 45 },
  ],
  [
    { id: 'glute_bridge', sets: 3, reps: '12-15', rest: 60 },
    { id: 'lunge', sets: 3, reps: '10/leg', rest: 60 },
    { id: 'push_up', sets: 3, reps: '8-12', rest: 60 },
    { id: 'calf_raise', sets: 3, reps: '15-20', rest: 45 },
    { id: 'jumping_jack', sets: 3, reps: '30 sec', rest: 30 },
  ],
];

const DAY_NAMES = ['Full Body A — Push & Core', 'Full Body B — Posterior & Conditioning'];
const DAY_FOCUS = ['push_core', 'posterior_chain_conditioning'];

// Light week-to-week progression: RPE climbs, and the day's first exercise
// picks up an extra set in the back half of the program.
const WEEK_RPE = [6, 7, 7, 8];
const WEEK_MAIN_SET_BONUS = [0, 0, 1, 1];

function buildBodyweightPlan(): Workout[] {
  const plan: Workout[] = [];
  for (let week = 1; week <= 4; week++) {
    for (let day = 1; day <= 4; day++) {
      const spec = DAY_SPECS[(day - 1) % 2];
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
        id: `bw_w${week}d${day}`,
        name: DAY_NAMES[(day - 1) % 2],
        focus: DAY_FOCUS[(day - 1) % 2],
        estimated_duration_min: 35,
        exercises,
        week_number: week,
        day_number: day,
      });
    }
  }
  return plan;
}

export const BODYWEIGHT_PLAN: Workout[] = buildBodyweightPlan();

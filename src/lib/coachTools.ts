// Plan-editing tools the coach chat can call (Anthropic tool use).
//
// The workout-coach edge function forwards these tool definitions to Claude;
// tool calls come back to the app and are executed HERE against workoutStore,
// then the results are sent back so the coach can confirm in plain language.

import { EXERCISES } from '../constants/exercises';
import { useWorkoutStore } from '../store/workoutStore';
import { useProfileStore } from '../store/profileStore';
import { useAuthStore } from '../store/authStore';
import { projectLiftTrend, projectBodyMetric } from './futureSelf';
import { Exercise, Workout, Injury, InjurySeverity, Goal, GoalCategory } from '../types';

const BODY_PARTS = ['lower_back', 'knees', 'left_shoulder', 'right_shoulder', 'wrists', 'elbows', 'neck', 'hips', 'ankles'];
const SEVERITIES: InjurySeverity[] = ['cautious', 'active_pain', 'avoid'];
const GOAL_CATEGORIES: GoalCategory[] = ['build_muscle', 'lose_fat', 'specific_activity', 'rehab', 'general_fitness'];

export const COACH_TOOLS = [
  {
    name: 'swap_exercise',
    description:
      "Replace an exercise in one of the user's workouts with a different exercise from the RYZR exercise library. The change persists in their plan.",
    input_schema: {
      type: 'object',
      properties: {
        workout_id: { type: 'string', description: "The workout's id from THE USER'S CURRENT PLAN list" },
        current_exercise_name: { type: 'string', description: 'Name of the exercise currently in the workout to replace' },
        new_exercise_name: { type: 'string', description: 'Exact exercise name from the EXERCISE LIBRARY list' },
      },
      required: ['workout_id', 'current_exercise_name', 'new_exercise_name'],
    },
  },
  {
    name: 'add_exercise',
    description:
      "Add an exercise from the RYZR exercise library to one of the user's workouts (e.g. after identifying equipment in a photo). Persists in their plan.",
    input_schema: {
      type: 'object',
      properties: {
        workout_id: { type: 'string', description: "The workout's id from THE USER'S CURRENT PLAN list" },
        exercise_name: { type: 'string', description: 'Exact exercise name from the EXERCISE LIBRARY list' },
        target_sets: { type: 'integer', description: 'Sets to prescribe (default 3)' },
        target_reps: { type: 'string', description: "Rep target, e.g. '8-12' (default '8-12')" },
        position: {
          type: 'string',
          enum: ['next', 'end'],
          description: "'next' = right after the user's current spot in an active session (or top of the workout); 'end' = last (default)",
        },
      },
      required: ['workout_id', 'exercise_name'],
    },
  },
  {
    name: 'update_injury',
    description:
      "Record or update a persistent injury/pain report so it's factored into every future workout plan, not just today's. Use this whenever the user reports pain or an injury, IN ADDITION TO swapping today's affected exercises with swap_exercise.",
    input_schema: {
      type: 'object',
      properties: {
        body_part: {
          type: 'string',
          enum: BODY_PARTS,
          description: 'Which body part hurts. Use left_shoulder/right_shoulder if the user specifies a side, otherwise pick the closest match.',
        },
        severity: {
          type: 'string',
          enum: SEVERITIES,
          description: '"cautious" = mild/manageable, "active_pain" = hurts during training, "avoid" = must avoid entirely',
        },
        notes: { type: 'string', description: 'Optional short note, e.g. "twisted it running"' },
      },
      required: ['body_part', 'severity'],
    },
  },
  {
    name: 'update_goal',
    description:
      "Update the user's primary training goal. Use this when the user states a new or changed goal (e.g. \"I want to build muscle\", \"help me lose fat\", \"training for a 10K\").",
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: GOAL_CATEGORIES },
        specific_activity: { type: 'string', description: 'Only if category is "specific_activity", e.g. "Surfing", "10K run"' },
        target_weeks: { type: 'integer', description: 'Target timeframe in weeks (default 8 if unspecified)' },
      },
      required: ['category'],
    },
  },
  {
    name: 'get_progress_projection',
    description:
      "Compute a deterministic trend projection from the user's logged history. Use this whenever the user asks what their future results will look like if they stay consistent (e.g. \"what will my bench be in a month\", \"will I hit my goal by summer\"). NEVER estimate or invent these numbers yourself — always call this tool and report exactly what it returns.",
    input_schema: {
      type: 'object',
      properties: {
        metric: {
          type: 'string',
          enum: ['lift', 'body_weight', 'body_fat'],
          description: "'lift' needs exercise_name; 'body_weight'/'body_fat' use logged body measurements from the Progress tab",
        },
        exercise_name: { type: 'string', description: 'Exact exercise name from the EXERCISE LIBRARY — required when metric is "lift"' },
        weeks_ahead: { type: 'integer', description: 'How many weeks out to project (default 4)' },
      },
      required: ['metric'],
    },
  },
];

/** Plan + library context block sent to the coach so tool targets resolve. */
export function buildPlanContext(): string {
  const { workouts, todayWorkout } = useWorkoutStore.getState();
  if (workouts.length === 0) return '';
  const lines = workouts.map((w) => {
    const today = todayWorkout?.id === w.id ? ' (TODAY)' : '';
    const exs = w.exercises.map((we) => `${we.exercise.name} (${we.target_sets}x${we.target_reps})`).join(', ');
    return `- workout_id "${w.id}" | ${w.name} | Week ${w.week_number} Day ${w.day_number}${today} | ${exs}`;
  });
  const library = EXERCISES.map((e) => {
    const equip = e.equipment_required.length > 0 ? e.equipment_required.join('/') : 'bodyweight';
    const avoid = e.contraindications.length > 0 ? e.contraindications.join(',') : 'none';
    return `${e.name} [equipment: ${equip}; avoid if: ${avoid}]`;
  }).join('\n');

  return `WORKOUTS (target tool calls by workout_id):
${lines.join('\n')}

EXERCISE LIBRARY (the ONLY valid exercise names for tools — "avoid if" lists the body
part(s)/injury this exercise stresses; "equipment" is what it requires, "bodyweight"
means none):
${library}`;
}

export interface CoachToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface CoachToolOutcome {
  toolUseId: string;
  ok: boolean;
  /** Sent back to the model as the tool_result. */
  result: string;
  /** Short line shown in the chat UI, e.g. "Swapped Bench Press → Chest Dip in Push Day". */
  summary: string;
}

function findWorkout(workoutId: string): Workout | null {
  const { workouts } = useWorkoutStore.getState();
  return (
    workouts.find((w) => w.id === workoutId) ??
    workouts.find((w) => w.name.toLowerCase() === workoutId.toLowerCase()) ??
    null
  );
}

function findLibraryExercise(name: string): Exercise | null {
  const n = name.toLowerCase().trim();
  return (
    EXERCISES.find((e) => e.name.toLowerCase() === n) ??
    EXERCISES.find((e) => e.name.toLowerCase().includes(n) || n.includes(e.name.toLowerCase())) ??
    null
  );
}

export async function executeCoachTool(tu: CoachToolUse): Promise<CoachToolOutcome> {
  try {
    if (tu.name === 'swap_exercise') {
      const workoutId = String(tu.input.workout_id ?? '');
      const currentName = String(tu.input.current_exercise_name ?? '');
      const newName = String(tu.input.new_exercise_name ?? '');

      const workout = findWorkout(workoutId);
      if (!workout) return fail(tu, `No workout with id "${workoutId}" found in the plan.`);
      const we = workout.exercises.find(
        (x) => x.exercise.name.toLowerCase() === currentName.toLowerCase().trim()
      ) ?? workout.exercises.find(
        (x) => x.exercise.name.toLowerCase().includes(currentName.toLowerCase().trim())
      );
      if (!we) return fail(tu, `"${currentName}" is not in ${workout.name}. Its exercises: ${workout.exercises.map((x) => x.exercise.name).join(', ')}.`);
      const replacement = findLibraryExercise(newName);
      if (!replacement) return fail(tu, `"${newName}" is not in the exercise library. Pick an exact name from the library list.`);

      await useWorkoutStore.getState().swapForPlan(workout.id, we.id, we.exercise.id, replacement, 'local');
      return {
        toolUseId: tu.id,
        ok: true,
        result: `Swapped "${we.exercise.name}" for "${replacement.name}" in ${workout.name} (Week ${workout.week_number} Day ${workout.day_number}). The change is saved to the plan.`,
        summary: `Swapped ${we.exercise.name} → ${replacement.name} in ${workout.name}`,
      };
    }

    if (tu.name === 'add_exercise') {
      const workoutId = String(tu.input.workout_id ?? '');
      const exerciseName = String(tu.input.exercise_name ?? '');
      const sets = Number(tu.input.target_sets) || 3;
      const reps = typeof tu.input.target_reps === 'string' && tu.input.target_reps ? tu.input.target_reps : '8-12';
      const position = tu.input.position === 'next' ? 'next' : 'end';

      const workout = findWorkout(workoutId);
      if (!workout) return fail(tu, `No workout with id "${workoutId}" found in the plan.`);
      const exercise = findLibraryExercise(exerciseName);
      if (!exercise) return fail(tu, `"${exerciseName}" is not in the exercise library. Pick an exact name from the library list.`);
      if (workout.exercises.some((x) => x.exercise.id === exercise.id)) {
        return fail(tu, `${exercise.name} is already in ${workout.name}.`);
      }

      useWorkoutStore.getState().addExerciseToWorkout(workout.id, exercise, {
        targetSets: sets,
        targetReps: reps,
        position,
      });
      const placement = position === 'next' ? 'up next' : 'at the end';
      return {
        toolUseId: tu.id,
        ok: true,
        result: `Added "${exercise.name}" (${sets}x${reps}) ${placement} in ${workout.name} (Week ${workout.week_number} Day ${workout.day_number}).`,
        summary: `Added ${exercise.name} (${sets}×${reps}) to ${workout.name}`,
      };
    }

    if (tu.name === 'update_injury') {
      const bodyPart = String(tu.input.body_part ?? '');
      const severity = String(tu.input.severity ?? '') as InjurySeverity;
      if (!BODY_PARTS.includes(bodyPart)) return fail(tu, `"${bodyPart}" is not a recognized body part.`);
      if (!SEVERITIES.includes(severity)) return fail(tu, `"${severity}" is not a valid severity.`);
      const notes = typeof tu.input.notes === 'string' ? tu.input.notes : undefined;

      const { injuries, setInjuries } = useProfileStore.getState();
      const entry: Injury = { id: `${bodyPart}-${Date.now()}`, body_part: bodyPart, severity, notes };
      setInjuries([...injuries.filter((i) => i.body_part !== bodyPart), entry]);

      const label = bodyPart.replace(/_/g, ' ');
      return {
        toolUseId: tu.id,
        ok: true,
        result: `Saved: ${label} (${severity}). This is now factored into every future workout plan, not just today's.`,
        summary: `Logged ${label} injury (${severity})`,
      };
    }

    if (tu.name === 'update_goal') {
      const category = String(tu.input.category ?? '') as GoalCategory;
      if (!GOAL_CATEGORIES.includes(category)) return fail(tu, `"${category}" is not a valid goal category.`);
      const specific = typeof tu.input.specific_activity === 'string' ? tu.input.specific_activity : undefined;
      const weeks = Number(tu.input.target_weeks) || 8;

      const goal: Goal = {
        id: Math.random().toString(36).slice(2),
        category,
        specific_activity: category === 'specific_activity' ? specific : undefined,
        target_weeks: weeks,
      };
      useProfileStore.getState().setGoals([goal]);

      const label = category.replace(/_/g, ' ');
      return {
        toolUseId: tu.id,
        ok: true,
        result: `Goal updated to ${label}${specific ? ` (${specific})` : ''}, ${weeks}-week target. Future plans will reflect this.`,
        summary: `Updated goal → ${label}`,
      };
    }

    if (tu.name === 'get_progress_projection') {
      const metric = String(tu.input.metric ?? '');
      const weeksAhead = Number(tu.input.weeks_ahead) || 4;

      if (metric === 'lift') {
        const name = String(tu.input.exercise_name ?? '');
        const exercise = findLibraryExercise(name);
        if (!exercise) return fail(tu, `"${name}" is not in the exercise library.`);
        const proj = projectLiftTrend(exercise.name, weeksAhead);
        if (!proj) {
          return {
            toolUseId: tu.id,
            ok: true,
            result: `Not enough logged history for ${exercise.name} yet — need at least 3 sessions spanning 10+ days. Tell the user to keep logging and check back.`,
            summary: `Not enough data yet for ${exercise.name}`,
          };
        }
        return {
          toolUseId: tu.id,
          ok: true,
          result: `${proj.label}: current est. 1RM ${proj.currentValue}kg → projected ${proj.projectedValue}kg in ${proj.weeksAhead} weeks (by ${proj.asOfDate}), based on ${proj.dataPoints} logged sessions. This is a deterministic linear trend, not a guarantee.`,
          summary: `Projected ${proj.label}: ${proj.currentValue}kg → ${proj.projectedValue}kg`,
        };
      }

      if (metric === 'body_weight' || metric === 'body_fat') {
        const userId = useAuthStore.getState().session?.user?.id;
        if (!userId) return fail(tu, 'No signed-in user.');
        const proj = await projectBodyMetric(userId, metric === 'body_weight' ? 'weight_kg' : 'body_fat_pct', weeksAhead);
        if (!proj) {
          return {
            toolUseId: tu.id,
            ok: true,
            result: `Not enough logged body measurements yet — need at least 3 logs spanning 10+ days. Tell the user to log a few more entries in Progress → Body Composition.`,
            summary: `Not enough data yet for ${metric.replace('_', ' ')}`,
          };
        }
        return {
          toolUseId: tu.id,
          ok: true,
          result: `${proj.label}: current ${proj.currentValue}${proj.unit} → projected ${proj.projectedValue}${proj.unit} in ${proj.weeksAhead} weeks (by ${proj.asOfDate}), based on ${proj.dataPoints} logged entries. This is a deterministic linear trend, not a guarantee.`,
          summary: `Projected ${proj.label}: ${proj.currentValue}${proj.unit} → ${proj.projectedValue}${proj.unit}`,
        };
      }

      return fail(tu, `Unknown metric "${metric}".`);
    }

    return fail(tu, `Unknown tool "${tu.name}".`);
  } catch (e: any) {
    return fail(tu, `Tool failed: ${e?.message ?? 'unknown error'}.`);
  }
}

function fail(tu: CoachToolUse, msg: string): CoachToolOutcome {
  return { toolUseId: tu.id, ok: false, result: msg, summary: `Couldn't complete that: ${msg}` };
}

// Plan-editing tools the coach chat can call (Anthropic tool use).
//
// The workout-coach edge function forwards these tool definitions to Claude;
// tool calls come back to the app and are executed HERE against workoutStore,
// then the results are sent back so the coach can confirm in plain language.

import { EXERCISES } from '../constants/exercises';
import { useWorkoutStore } from '../store/workoutStore';
import { Exercise, Workout } from '../types';

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
  return `WORKOUTS (target tool calls by workout_id):
${lines.join('\n')}

EXERCISE LIBRARY (the ONLY valid exercise names for tools):
${EXERCISES.map((e) => e.name).join(', ')}`;
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

    return fail(tu, `Unknown tool "${tu.name}".`);
  } catch (e: any) {
    return fail(tu, `Tool failed: ${e?.message ?? 'unknown error'}.`);
  }
}

function fail(tu: CoachToolUse, msg: string): CoachToolOutcome {
  return { toolUseId: tu.id, ok: false, result: msg, summary: `Couldn't complete that: ${msg}` };
}

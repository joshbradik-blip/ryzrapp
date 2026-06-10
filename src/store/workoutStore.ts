import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Workout, WorkoutExercise, Session, SessionSet, Exercise, ExerciseDBExercise } from '../types';
import { EXERCISES } from '../constants/exercises';
import { supabase } from '../lib/supabase';

interface ActiveSet {
  workoutExerciseId: string;
  setNumber: number;
  reps: number;
  weight: number;
}

interface WorkoutState {
  workouts: Workout[];
  todayWorkout: Workout | null;
  currentWorkoutIndex: number;
  activeSession: Session | null;
  activeSets: ActiveSet[];
  currentExerciseIndex: number;
  currentSetIndex: number;
  restTimerActive: boolean;
  restSecondsRemaining: number;

  setWorkouts: (workouts: Workout[]) => void;
  setTodayWorkout: (workout: Workout | null) => void;
  advanceWorkout: () => void;
  selectWorkout: (workoutId: string) => void;
  startSession: (workoutId: string) => void;
  logSet: (set: ActiveSet) => void;
  nextExercise: () => void;
  startRestTimer: (seconds: number) => void;
  tickRestTimer: () => void;
  stopRestTimer: () => void;
  completeSession: (feltRating: 'easy' | 'just_right' | 'hard') => void;
  reset: () => void;

  // Swap for current session only (in-memory)
  swapForSession: (
    workoutId: string,
    workoutExerciseId: string,
    replacement: Exercise | ExerciseDBExercise,
    source: 'local' | 'exercisedb'
  ) => void;

  // Swap permanently — persists to Supabase and updates all workouts in store
  swapForPlan: (
    workoutId: string,
    workoutExerciseId: string,
    originalExerciseId: string,
    replacement: Exercise | ExerciseDBExercise,
    source: 'local' | 'exercisedb'
  ) => Promise<void>;

  // Load saved substitutions from Supabase and apply to workouts
  loadSubstitutions: (userId: string) => Promise<void>;
}

function buildReplacementExercise(
  replacement: Exercise | ExerciseDBExercise,
  source: 'local' | 'exercisedb'
): Exercise {
  if (source === 'local') {
    return replacement as Exercise;
  }
  const db = replacement as ExerciseDBExercise;
  return {
    id: `edb_${db.id}`,
    name: db.name,
    category: db.bodyPart,
    muscles_primary: [db.target],
    muscles_secondary: db.secondaryMuscles ?? [],
    equipment_required: [db.equipment],
    difficulty: (db.difficulty as Exercise['difficulty']) ?? 'intermediate',
    setup_cues: db.instructions.slice(0, 2),
    execution_cues: db.instructions.slice(2),
    common_mistakes: [],
    contraindications: [],
  };
}

function applySwapToWorkout(
  workout: Workout,
  workoutExerciseId: string,
  newExercise: Exercise
): Workout {
  return {
    ...workout,
    exercises: workout.exercises.map((we) =>
      we.id === workoutExerciseId ? { ...we, exercise: newExercise } : we
    ),
  };
}

export const useWorkoutStore = create<WorkoutState>()(persist((set, get) => ({
  workouts: [],
  todayWorkout: null,
  currentWorkoutIndex: 0,
  activeSession: null,
  activeSets: [],
  currentExerciseIndex: 0,
  currentSetIndex: 0,
  restTimerActive: false,
  restSecondsRemaining: 0,

  setWorkouts: (workouts) => set({ workouts, currentWorkoutIndex: 0 }),

  setTodayWorkout: (workout) => set({ todayWorkout: workout }),

  // Advance to the next workout in the plan, wrapping back to the first
  // after the last day so the plan repeats.
  advanceWorkout: () =>
    set((s) => {
      if (s.workouts.length === 0) return {};
      const nextIndex = (s.currentWorkoutIndex + 1) % s.workouts.length;
      return { currentWorkoutIndex: nextIndex, todayWorkout: s.workouts[nextIndex] };
    }),

  // Manually jump to any workout in the plan (e.g. picking a different day).
  selectWorkout: (workoutId) =>
    set((s) => {
      const idx = s.workouts.findIndex((w) => w.id === workoutId);
      if (idx === -1) return {};
      return { currentWorkoutIndex: idx, todayWorkout: s.workouts[idx] };
    }),

  startSession: (workoutId) =>
    set({
      activeSession: {
        id: Math.random().toString(36).slice(2),
        workout_id: workoutId,
        started_at: new Date().toISOString(),
        sets: [],
      },
      activeSets: [],
      currentExerciseIndex: 0,
      currentSetIndex: 0,
    }),

  logSet: (newSet) =>
    set((s) => ({ activeSets: [...s.activeSets, newSet] })),

  nextExercise: () =>
    set((s) => ({
      currentExerciseIndex: s.currentExerciseIndex + 1,
      currentSetIndex: 0,
    })),

  startRestTimer: (seconds) =>
    set({ restTimerActive: true, restSecondsRemaining: seconds }),

  tickRestTimer: () =>
    set((s) => {
      const next = s.restSecondsRemaining - 1;
      if (next <= 0) return { restTimerActive: false, restSecondsRemaining: 0 };
      return { restSecondsRemaining: next };
    }),

  stopRestTimer: () => set({ restTimerActive: false, restSecondsRemaining: 0 }),

  completeSession: (feltRating) =>
    set((s) => ({
      activeSession: s.activeSession
        ? { ...s.activeSession, completed_at: new Date().toISOString(), felt_rating: feltRating }
        : null,
    })),

  reset: () =>
    set({
      activeSession: null,
      activeSets: [],
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      restTimerActive: false,
      restSecondsRemaining: 0,
    }),

  swapForSession: (workoutId, workoutExerciseId, replacement, source) => {
    const newExercise = buildReplacementExercise(replacement, source);
    set((s) => {
      const updatedWorkouts = s.workouts.map((w) =>
        w.id === workoutId ? applySwapToWorkout(w, workoutExerciseId, newExercise) : w
      );
      const updatedToday =
        s.todayWorkout?.id === workoutId
          ? applySwapToWorkout(s.todayWorkout, workoutExerciseId, newExercise)
          : s.todayWorkout;
      return { workouts: updatedWorkouts, todayWorkout: updatedToday };
    });
  },

  swapForPlan: async (workoutId, workoutExerciseId, originalExerciseId, replacement, source) => {
    // Apply locally first for instant UI feedback
    get().swapForSession(workoutId, workoutExerciseId, replacement, source);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const dbData = source === 'exercisedb' ? replacement : null;
    const substituteId = source === 'local'
      ? (replacement as Exercise).id
      : `edb_${(replacement as ExerciseDBExercise).id}`;

    await supabase.from('workout_exercise_substitutions').upsert(
      {
        user_id: user.id,
        workout_id: workoutId,
        original_exercise_id: originalExerciseId,
        substitute_exercise_id: substituteId,
        substitute_source: source,
        exercisedb_data: dbData,
      },
      { onConflict: 'user_id,workout_id,original_exercise_id' }
    );
  },

  loadSubstitutions: async (userId) => {
    const { data, error } = await supabase
      .from('workout_exercise_substitutions')
      .select('*')
      .eq('user_id', userId);

    if (error || !data || data.length === 0) return;

    set((s) => {
      let workouts = [...s.workouts];
      let todayWorkout = s.todayWorkout ? { ...s.todayWorkout } : null;

      for (const sub of data) {
        let newExercise: Exercise | null = null;

        if (sub.substitute_source === 'local') {
          newExercise = EXERCISES.find((e) => e.id === sub.substitute_exercise_id) ?? null;
        } else if (sub.substitute_source === 'exercisedb' && sub.exercisedb_data) {
          newExercise = buildReplacementExercise(sub.exercisedb_data as ExerciseDBExercise, 'exercisedb');
        }

        if (!newExercise) continue;

        workouts = workouts.map((w) => {
          if (w.id !== sub.workout_id) return w;
          const we = w.exercises.find(
            (e) => e.exercise.id === sub.original_exercise_id
          );
          return we ? applySwapToWorkout(w, we.id, newExercise!) : w;
        });

        if (todayWorkout && todayWorkout.id === sub.workout_id) {
          const we = todayWorkout.exercises.find(
            (e) => e.exercise.id === sub.original_exercise_id
          );
          if (we) todayWorkout = applySwapToWorkout(todayWorkout, we.id, newExercise!);
        }
      }

      return { workouts, todayWorkout };
    });
  },
}), {
  name: 'ryzr-workouts',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (state) => ({ workouts: state.workouts, todayWorkout: state.todayWorkout, currentWorkoutIndex: state.currentWorkoutIndex }),
}));

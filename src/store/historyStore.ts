import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  BestWeight,
  HistorySession,
  HistorySet,
  HeatLevel,
  LastSessionPerf,
  computeStreaks,
  lastSetByExercise,
  lastSessionByExercise,
  bestWeightByExercise,
  weeklyVolume,
  muscleHeat,
} from '../lib/historyMetrics';
import { getExerciseById } from '../constants/exercises';

interface HistoryState {
  sessions: HistorySession[];
  sets: HistorySet[];
  loaded: boolean;
  loading: boolean;
  fetchHistory: (userId: string) => Promise<void>;

  // derived (recomputed on each fetch)
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  thisWeekSessions: number;
  lastSets: Record<string, { weight_kg: number; reps: number }>;
  lastSessionPerf: Record<string, LastSessionPerf>;
  bestWeights: Record<string, BestWeight>;
  volumeByWeek: { label: string; volumeKg: number }[];
  muscleHeatMap: Record<string, HeatLevel>;
}

function muscleLookup(exerciseId: string) {
  const ex = getExerciseById(exerciseId);
  return ex ? { primary: ex.muscles_primary, secondary: ex.muscles_secondary } : null;
}

function weekStartMs(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  sessions: [],
  sets: [],
  loaded: false,
  loading: false,
  currentStreak: 0,
  longestStreak: 0,
  totalSessions: 0,
  thisWeekSessions: 0,
  lastSets: {},
  lastSessionPerf: {},
  bestWeights: {},
  volumeByWeek: [],
  muscleHeatMap: {},

  fetchHistory: async (userId: string) => {
    if (!userId || get().loading) return;
    set({ loading: true });
    try {
      const [sessRes, setsRes] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select('id, workout_name, started_at, completed_at, total_volume_kg')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(500),
        supabase
          .from('session_sets')
          .select('session_id, exercise_id, exercise_name, set_number, reps, weight_kg, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);
      if (sessRes.error || setsRes.error) throw sessRes.error ?? setsRes.error;

      const sessions = (sessRes.data ?? []) as HistorySession[];
      const sets = (setsRes.data ?? []) as HistorySet[];
      const { current, longest } = computeStreaks(sessions);
      const ws = weekStartMs();

      set({
        sessions,
        sets,
        loaded: true,
        loading: false,
        currentStreak: current,
        longestStreak: longest,
        totalSessions: sessions.length,
        thisWeekSessions: sessions.filter((s) => new Date(s.started_at).getTime() >= ws).length,
        lastSets: lastSetByExercise(sets),
        lastSessionPerf: lastSessionByExercise(sets),
        bestWeights: bestWeightByExercise(sets),
        volumeByWeek: weeklyVolume(sessions, 8),
        muscleHeatMap: muscleHeat(sets, muscleLookup),
      });
    } catch {
      // Degrade silently — UI shows empty states rather than crashing.
      set({ loading: false, loaded: true });
    }
  },
}));

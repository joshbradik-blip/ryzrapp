import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BodyComposition, DailyHealthMetrics, Health } from '../lib/health';
import {
  HealthDailyRow,
  WearableRecords,
  deriveWearableRecords,
  fetchHealthHistory,
  healthSource,
  syncHealthToCloud,
} from '../lib/healthSync';
import { useBodyStore } from './bodyStore';

const EMPTY_RECORDS: WearableRecords = {
  bestSteps: null,
  bestActiveCalories: null,
  longestSleepMinutes: null,
  lowestRestingHr: null,
  bestDistanceMeters: null,
};

interface WearablesState {
  connected: string[];
  toggle: (id: string) => void;
  disconnect: (id: string) => void;

  // Live + synced health data (not persisted — refetched per session)
  today: DailyHealthMetrics | null;
  bodyComp: BodyComposition | null;
  history: HealthDailyRow[];
  records: WearableRecords;
  lastSyncedAt: string | null;
  syncing: boolean;

  /** Pull the trailing window from the OS hub, upsert to Supabase, refresh records. */
  sync: (userId: string) => Promise<void>;
  /** Load synced history + records from Supabase only (works without the native provider). */
  loadHistory: (userId: string) => Promise<void>;
  clearLive: () => void;
}

// Merge Supabase history with fresher provider days so records reflect both.
function mergeDays(history: DailyHealthMetrics[], fresh: DailyHealthMetrics[]): DailyHealthMetrics[] {
  const byDate = new Map<string, DailyHealthMetrics>();
  for (const d of history) byDate.set(d.date, d);
  for (const d of fresh) byDate.set(d.date, d);
  return [...byDate.values()];
}

export const useWearablesStore = create<WearablesState>()(
  persist(
    (set, get) => ({
      connected: [],
      toggle: (id) =>
        set((s) => ({
          connected: s.connected.includes(id)
            ? s.connected.filter((c) => c !== id)
            : [...s.connected, id],
        })),
      disconnect: (id) =>
        set((s) => ({ connected: s.connected.filter((c) => c !== id) })),

      today: null,
      bodyComp: null,
      history: [],
      records: EMPTY_RECORDS,
      lastSyncedAt: null,
      syncing: false,

      sync: async (userId: string) => {
        if (!userId || get().syncing || !Health.isAvailable()) return;
        set({ syncing: true });
        try {
          const [days, bodyComp, weight] = await Promise.all([
            syncHealthToCloud(userId),
            Health.getLatestBodyComposition(),
            Health.getLatestWeightKg(),
          ]);
          const today = days && days.length > 0 ? days[days.length - 1] : null;

          // Auto-log new scale readings into the bodyweight/body-comp history.
          if (weight) {
            const latest = useBodyStore.getState().latest;
            const changed =
              !latest || latest.weight_kg == null || Math.abs(latest.weight_kg - weight.kg) > 0.1;
            if (changed) {
              await useBodyStore.getState().logMeasurement(userId, {
                weight_kg: parseFloat(weight.kg.toFixed(1)),
                neck_cm: null,
                waist_cm: null,
                hip_cm: null,
                body_fat_pct: bodyComp.bodyFatPct?.value ?? null,
                lean_mass_kg: bodyComp.leanMassKg?.value ?? null,
                source: healthSource(),
              });
            }
          }

          const history = await fetchHealthHistory(userId);
          const merged = mergeDays(history, days ?? []);
          set({
            today,
            bodyComp,
            history,
            records: deriveWearableRecords(merged),
            lastSyncedAt: new Date().toISOString(),
            syncing: false,
          });
        } catch {
          set({ syncing: false });
        }
      },

      loadHistory: async (userId: string) => {
        if (!userId) return;
        const history = await fetchHealthHistory(userId);
        set({ history, records: deriveWearableRecords(history) });
      },

      clearLive: () => set({ today: null, bodyComp: null }),
    }),
    {
      name: 'ryzr-wearables',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ connected: s.connected, lastSyncedAt: s.lastSyncedAt }),
    }
  )
);

import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { BodyMeasurement } from '../types';

interface NewMeasurement {
  weight_kg: number | null;
  neck_cm: number | null;
  waist_cm: number | null;
  hip_cm: number | null;
  body_fat_pct: number | null;
  /** Smart-scale lean mass (wearable sync only — manual logs omit it). */
  lean_mass_kg?: number | null;
  /** 'manual' (default) | 'apple_health' | 'health_connect' */
  source?: string;
}

interface BodyState {
  latest: BodyMeasurement | null;
  previous: BodyMeasurement | null;
  loading: boolean;
  fetchMeasurements: (userId: string) => Promise<void>;
  logMeasurement: (userId: string, m: NewMeasurement) => Promise<boolean>;
}

export const useBodyStore = create<BodyState>((set, get) => ({
  latest: null,
  previous: null,
  loading: false,

  fetchMeasurements: async (userId: string) => {
    if (!userId || get().loading) return;
    set({ loading: true });
    try {
      const { data, error } = await supabase
        .from('body_measurements')
        .select('id, recorded_at, weight_kg, neck_cm, waist_cm, hip_cm, body_fat_pct, lean_mass_kg, source')
        .eq('user_id', userId)
        .order('recorded_at', { ascending: false })
        .limit(2);
      if (error) throw error;
      const rows = (data ?? []) as BodyMeasurement[];
      set({ latest: rows[0] ?? null, previous: rows[1] ?? null, loading: false });
    } catch {
      set({ loading: false });
    }
  },

  logMeasurement: async (userId: string, m: NewMeasurement) => {
    try {
      const { error } = await supabase.from('body_measurements').insert({
        user_id: userId,
        ...m,
      });
      if (error) throw error;
      await get().fetchMeasurements(userId);
      return true;
    } catch {
      return false;
    }
  },
}));

import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { NutritionEntry, NewNutritionEntry } from '../types';
import { localDayKey } from '../lib/nutrition';

interface NutritionState {
  /** Local calendar day currently in view (YYYY-MM-DD). */
  day: string;
  entries: NutritionEntry[];
  loading: boolean;
  fetchDay: (userId: string, day?: string) => Promise<void>;
  addEntry: (userId: string, entry: NewNutritionEntry) => Promise<boolean>;
  deleteEntry: (userId: string, id: string) => Promise<boolean>;
}

const COLUMNS = 'id, user_id, logged_on, meal, name, calories, protein_g, carbs_g, fat_g, created_at';

export const useNutritionStore = create<NutritionState>((set, get) => ({
  day: localDayKey(),
  entries: [],
  loading: false,

  fetchDay: async (userId: string, day = get().day) => {
    if (!userId) return;
    set({ day, loading: true });
    try {
      const { data, error } = await supabase
        .from('nutrition_logs')
        .select(COLUMNS)
        .eq('user_id', userId)
        .eq('logged_on', day)
        .order('created_at', { ascending: true });
      if (error) throw error;
      set({ entries: (data ?? []) as NutritionEntry[], loading: false });
    } catch {
      set({ loading: false });
    }
  },

  addEntry: async (userId: string, entry: NewNutritionEntry) => {
    try {
      const { error } = await supabase.from('nutrition_logs').insert({ user_id: userId, ...entry });
      if (error) throw error;
      // Only refresh the visible day if the new entry belongs to it.
      if (entry.logged_on === get().day) await get().fetchDay(userId, get().day);
      return true;
    } catch {
      return false;
    }
  },

  deleteEntry: async (userId: string, id: string) => {
    try {
      const { error } = await supabase.from('nutrition_logs').delete().eq('id', id).eq('user_id', userId);
      if (error) throw error;
      set({ entries: get().entries.filter((e) => e.id !== id) });
      return true;
    } catch {
      return false;
    }
  },
}));

// Remote feature switches.
//
// Values live in the Supabase `app_config` table (see
// supabase/migrations/20260928000000_app_config.sql), so a feature can be
// turned off for every install from the Supabase dashboard — no build, no
// OTA update, no App Review.
//
// Failure is always safe: if the table is missing, the network is down, or
// the row is malformed, the last value this device saw is kept, and before
// any fetch has ever succeeded the compiled-in default applies. Nothing here
// can block app start.

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { supabase } from './supabase';

export interface FeatureFlags {
  /** Form Coach camera: every entry point and every marketing mention. */
  formCoach: boolean;
}

const DEFAULTS: FeatureFlags = {
  formCoach: true,
};

/** `app_config.key` for each flag. */
const REMOTE_KEYS: Record<keyof FeatureFlags, string> = {
  formCoach: 'form_coach_enabled',
};

const CACHE_KEY = 'feature_flags_v1';
/** Re-check on foreground at most this often. */
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export const useFeatureFlags = create<FeatureFlags>(() => ({ ...DEFAULTS }));

export function useFormCoachEnabled(): boolean {
  return useFeatureFlags((s) => s.formCoach);
}

let lastFetchAt = 0;
let started = false;

function parse(rows: { key: string; value: unknown }[] | null): Partial<FeatureFlags> {
  const out: Partial<FeatureFlags> = {};
  if (!rows) return out;
  for (const flag of Object.keys(REMOTE_KEYS) as (keyof FeatureFlags)[]) {
    const row = rows.find((r) => r.key === REMOTE_KEYS[flag]);
    if (row && typeof row.value === 'boolean') out[flag] = row.value;
  }
  return out;
}

async function refresh(): Promise<void> {
  lastFetchAt = Date.now();
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('key, value')
      .in('key', Object.values(REMOTE_KEYS));
    if (error) return;
    const remote = parse(data as { key: string; value: unknown }[] | null);
    if (Object.keys(remote).length === 0) return;
    useFeatureFlags.setState(remote);
    AsyncStorage.setItem(CACHE_KEY, JSON.stringify(useFeatureFlags.getState())).catch(() => {});
  } catch {
    // Keep whatever we had.
  }
}

/** Call once at app start. Loads the cached flags, then fetches fresh ones. */
export function initFeatureFlags(): void {
  if (started) return;
  started = true;

  AsyncStorage.getItem(CACHE_KEY)
    .then((raw) => {
      if (!raw) return;
      const cached = JSON.parse(raw) as Partial<FeatureFlags>;
      const clean: Partial<FeatureFlags> = {};
      for (const k of Object.keys(DEFAULTS) as (keyof FeatureFlags)[]) {
        if (typeof cached[k] === 'boolean') clean[k] = cached[k];
      }
      useFeatureFlags.setState(clean);
    })
    .catch(() => {})
    // Fetch only after the cache is applied, so a stale cache can never
    // overwrite a fresh answer.
    .finally(() => { refresh(); });

  AppState.addEventListener('change', (state) => {
    if (state === 'active' && Date.now() - lastFetchAt > REFRESH_INTERVAL_MS) refresh();
  });
}

// Wearable → Supabase sync + pure derivations over the synced history.
//
// The provider (Apple Health / Health Connect) is the source of truth for the
// trailing window; Supabase `health_daily_metrics` is the durable history that
// survives device switches and feeds the Progress screen's activity records.

import { Platform } from 'react-native';
import { supabase } from './supabase';
import { DailyHealthMetrics, Health } from './health';

/** How many trailing days we re-read from the OS hub on every sync. */
export const SYNC_WINDOW_DAYS = 14;

export type HealthMetricSource = 'apple_health' | 'health_connect';

export function healthSource(): HealthMetricSource {
  return Platform.OS === 'ios' ? 'apple_health' : 'health_connect';
}

export interface HealthDailyRow extends DailyHealthMetrics {
  source: HealthMetricSource;
}

function hasAnyData(d: DailyHealthMetrics): boolean {
  return (
    d.steps != null ||
    d.restingHr != null ||
    d.hrvMs != null ||
    d.sleepMinutes != null ||
    d.activeCalories != null ||
    d.distanceMeters != null
  );
}

/**
 * Read the trailing window from the OS hub and upsert it to Supabase.
 * Returns the provider's daily metrics (oldest first), or null when the
 * native provider isn't available in this build.
 */
export async function syncHealthToCloud(userId: string): Promise<DailyHealthMetrics[] | null> {
  if (!Health.isAvailable()) return null;
  const days = await Health.getDailyMetrics(SYNC_WINDOW_DAYS);
  const rows = days.filter(hasAnyData).map((d) => ({
    user_id: userId,
    date: d.date,
    steps: d.steps,
    resting_hr: d.restingHr,
    hrv_ms: d.hrvMs,
    sleep_minutes: d.sleepMinutes,
    active_calories: d.activeCalories,
    distance_meters: d.distanceMeters,
    source: healthSource(),
    synced_at: new Date().toISOString(),
  }));
  if (rows.length > 0) {
    // Best effort: local metrics still render even if the table isn't migrated yet.
    try {
      await supabase.from('health_daily_metrics').upsert(rows, { onConflict: 'user_id,date' });
    } catch {}
  }
  return days;
}

/** Synced history from Supabase (oldest first), independent of the native provider. */
export async function fetchHealthHistory(userId: string, days = 90): Promise<HealthDailyRow[]> {
  try {
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('health_daily_metrics')
      .select('date, steps, resting_hr, hrv_ms, sleep_minutes, active_calories, distance_meters, source')
      .eq('user_id', userId)
      .gte('date', since)
      .order('date', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r: any) => ({
      date: r.date,
      steps: r.steps,
      restingHr: r.resting_hr,
      hrvMs: r.hrv_ms != null ? Number(r.hrv_ms) : null,
      sleepMinutes: r.sleep_minutes,
      activeCalories: r.active_calories,
      distanceMeters: r.distance_meters,
      source: r.source,
    }));
  } catch {
    return [];
  }
}

export interface WearableRecord {
  value: number;
  date: string; // YYYY-MM-DD
}

/** Wearable "personal records" shown alongside strength PRs on Progress. */
export interface WearableRecords {
  bestSteps: WearableRecord | null;
  bestActiveCalories: WearableRecord | null;
  longestSleepMinutes: WearableRecord | null;
  lowestRestingHr: WearableRecord | null;
  bestDistanceMeters: WearableRecord | null;
}

export function deriveWearableRecords(rows: DailyHealthMetrics[]): WearableRecords {
  const best = (
    pick: (d: DailyHealthMetrics) => number | null,
    better: (a: number, b: number) => boolean,
  ): WearableRecord | null => {
    let out: WearableRecord | null = null;
    for (const d of rows) {
      const v = pick(d);
      if (v == null || v <= 0) continue;
      if (!out || better(v, out.value)) out = { value: v, date: d.date };
    }
    return out;
  };
  const higher = (a: number, b: number) => a > b;
  const lower = (a: number, b: number) => a < b;
  return {
    bestSteps: best((d) => d.steps, higher),
    bestActiveCalories: best((d) => d.activeCalories, higher),
    longestSleepMinutes: best((d) => d.sleepMinutes, higher),
    lowestRestingHr: best((d) => d.restingHr, lower),
    bestDistanceMeters: best((d) => d.distanceMeters, higher),
  };
}

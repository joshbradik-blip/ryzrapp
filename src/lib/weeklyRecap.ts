// AI weekly recap: gathers the trailing 7 days of training + wearable data,
// asks the coach for a short narrative, and caches one recap per ISO week so
// it costs a single Haiku call per user per week.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateWeeklyRecap } from './anthropic';
import { kgToDisplay, weightLabel } from './units';
import { useHistoryStore } from '../store/historyStore';
import { useWearablesStore } from '../store/wearablesStore';
import { useProfileStore } from '../store/profileStore';

const CACHE_KEY = 'ryzr-weekly-recap';
const WEEK_MS = 7 * 86400000;

export interface WeeklyRecap {
  weekKey: string;
  text: string;
  generatedAt: string;
}

// Monday-anchored key so the recap refreshes at the start of each week.
function currentWeekKey(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

function buildStatsBlock(): string | null {
  const { sessions, sets, bestWeights, currentStreak } = useHistoryStore.getState();
  const { history } = useWearablesStore.getState();
  const unit = useProfileStore.getState().profile?.weight_unit ?? 'kg';
  const cutoff = Date.now() - WEEK_MS;

  const weekSessions = sessions.filter((s) => new Date(s.started_at).getTime() >= cutoff);
  if (weekSessions.length === 0) return null; // nothing to recap

  const volumeKg = weekSessions.reduce((sum, s) => sum + (s.total_volume_kg ?? 0), 0);
  const weekSets = sets.filter((s) => new Date(s.created_at).getTime() >= cutoff).length;
  const prs = Object.values(bestWeights).filter((b) => new Date(b.at).getTime() >= cutoff);

  const lines = [
    `Workouts completed: ${weekSessions.length} (${weekSessions.map((s) => s.workout_name).join(', ')})`,
    `Sets logged: ${weekSets}, total volume: ${Math.round(kgToDisplay(volumeKg, unit)).toLocaleString()} ${weightLabel(unit)}`,
    `Current streak: ${currentStreak} days`,
  ];
  if (prs.length > 0) {
    lines.push(`PRs set this week: ${prs.map((p) => `${p.name} ${kgToDisplay(p.weight_kg, unit)} ${weightLabel(unit)}`).join(', ')}`);
  }

  const weekHealth = history.filter((h) => new Date(h.date).getTime() >= cutoff);
  const avg = (pick: (d: (typeof weekHealth)[number]) => number | null): number | null => {
    const vals = weekHealth.map(pick).filter((v): v is number => v != null && v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const sleep = avg((d) => d.sleepMinutes);
  const steps = avg((d) => d.steps);
  const rhr = avg((d) => d.restingHr);
  if (sleep != null) lines.push(`Avg sleep: ${Math.floor(sleep / 60)}h ${Math.round(sleep % 60)}m/night`);
  if (steps != null) lines.push(`Avg steps: ${Math.round(steps).toLocaleString()}/day`);
  if (rhr != null) lines.push(`Avg resting HR: ${Math.round(rhr)} bpm`);

  return lines.join('\n');
}

/**
 * Cached recap for this week, generating it on first call. Null when the
 * user has no sessions in the trailing 7 days (nothing worth recapping).
 */
export async function getOrGenerateWeeklyRecap(): Promise<WeeklyRecap | null> {
  const weekKey = currentWeekKey();
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as WeeklyRecap;
      if (cached.weekKey === weekKey && cached.text) return cached;
    }
  } catch {}

  const stats = buildStatsBlock();
  if (!stats) return null;

  const name = useProfileStore.getState().profile?.name ?? 'Athlete';
  try {
    const text = await generateWeeklyRecap(name, stats);
    if (!text) return null;
    const recap: WeeklyRecap = { weekKey, text, generatedAt: new Date().toISOString() };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(recap)).catch(() => {});
    return recap;
  } catch {
    return null;
  }
}

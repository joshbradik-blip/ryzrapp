// "Coach Notices" — occasional, proactive pattern-spotting messages.
//
// Pattern detection is deterministic (reads historyStore/workoutStore only);
// the AI's only job is phrasing one detected fact in coach voice. Cadence is
// capped to roughly once every 8+ days so it reads as noticing, not nagging.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useHistoryStore } from '../store/historyStore';
import { useWorkoutStore } from '../store/workoutStore';
import { useProfileStore } from '../store/profileStore';
import { strengthProgression, topExercisesBySets } from './historyMetrics';
import { generateCoachNotice } from './anthropic';

const CACHE_KEY = 'ryzr-coach-notice';
const MIN_GAP_DAYS = 8;
const DAY_MS = 86400000;

export interface DetectedNotice {
  kind: 'plateau' | 'streak' | 'skipped_day' | 'skipped_exercise';
  fact: string; // plain factual statement fed to the AI to phrase
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function detectPlateau(): DetectedNotice | null {
  const { sets } = useHistoryStore.getState();
  const topLift = topExercisesBySets(sets, 1)[0];
  if (!topLift) return null;
  const points = strengthProgression(sets, topLift, 6);
  if (points.length < 4) return null;
  const recent = points.slice(-4);
  const allSame = recent.every((p) => p.weightKg === recent[0].weightKg);
  if (!allSame) return null;
  return { kind: 'plateau', fact: `The user has logged the same weight (${recent[0].weightKg}kg) on ${topLift} for their last ${recent.length} sessions with it — no progression.` };
}

function detectStreak(): DetectedNotice | null {
  const { currentStreak } = useHistoryStore.getState();
  const milestones = [7, 14, 30, 60, 100];
  const hit = milestones.find((m) => currentStreak === m);
  if (!hit) return null;
  return { kind: 'streak', fact: `The user has trained every day for ${hit} days straight — a genuine consistency streak.` };
}

// Flags a weekday that was a real habit a month ago but has dropped off —
// not just "this weekday has zero sessions," which would also catch a
// deliberate rest day. Requires the user to still be training regularly
// overall, so this reads as a dropped habit, not a general slowdown.
function detectSkippedDay(): DetectedNotice | null {
  const { sessions } = useHistoryStore.getState();
  const now = Date.now();
  const recent = sessions.filter((s) => now - new Date(s.started_at).getTime() < 28 * DAY_MS);
  const prior = sessions.filter((s) => {
    const age = now - new Date(s.started_at).getTime();
    return age >= 28 * DAY_MS && age < 56 * DAY_MS;
  });
  if (recent.length < 6 || prior.length < 4) return null;

  const countByWeekday = (list: typeof sessions) => {
    const counts = new Array(7).fill(0);
    for (const s of list) counts[new Date(s.started_at).getDay()]++;
    return counts;
  };
  const recentCounts = countByWeekday(recent);
  const priorCounts = countByWeekday(prior);

  for (let d = 0; d < 7; d++) {
    if (priorCounts[d] >= 2 && recentCounts[d] === 0) {
      return {
        kind: 'skipped_day',
        fact: `The user trained on ${WEEKDAYS[d]}s consistently a month ago (${priorCounts[d]} sessions) but has had zero ${WEEKDAYS[d]} sessions in the last 4 weeks, while still training regularly on other days.`,
      };
    }
  }
  return null;
}

function detectSkippedExercise(): DetectedNotice | null {
  const { sets } = useHistoryStore.getState();
  const { workouts } = useWorkoutStore.getState();

  for (const w of workouts) {
    for (const we of w.exercises) {
      const loggedForThis = sets.filter((s) => s.exercise_id === we.exercise.id);
      if (loggedForThis.length > 0) continue; // has been logged at least once

      const siblingSessionCounts = w.exercises
        .filter((x) => x.id !== we.id)
        .map((x) => new Set(sets.filter((s) => s.exercise_id === x.exercise.id).map((s) => s.session_id)).size);
      const maxSiblingSessions = siblingSessionCounts.length > 0 ? Math.max(...siblingSessionCounts) : 0;

      if (maxSiblingSessions >= 3) {
        return {
          kind: 'skipped_exercise',
          fact: `${we.exercise.name} is part of "${w.name}" but the user has never logged a single set of it, despite completing other exercises in that same workout at least ${maxSiblingSessions} times.`,
        };
      }
    }
  }
  return null;
}

/** Runs all detectors, returns the first hit (priority order matters). */
function detectNotice(): DetectedNotice | null {
  return detectSkippedExercise() ?? detectPlateau() ?? detectStreak() ?? detectSkippedDay();
}

interface NoticeCache {
  lastShownAt: string; // ISO date
  lastKind: string;
}

/**
 * Returns a phrased coach notice ready to queue, or null if it's too soon
 * since the last one or nothing was detected. Caches so the same pattern
 * doesn't fire again immediately.
 */
export async function getOrGenerateCoachNotice(): Promise<string | null> {
  const { totalSessions } = useHistoryStore.getState();
  if (totalSessions < 6) return null; // not enough history for a pattern to mean anything

  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as NoticeCache;
      const daysSince = (Date.now() - new Date(cached.lastShownAt).getTime()) / DAY_MS;
      if (daysSince < MIN_GAP_DAYS) return null;
    }
  } catch {}

  const notice = detectNotice();
  if (!notice) return null;

  const name = useProfileStore.getState().profile?.name ?? 'Athlete';
  try {
    const text = await generateCoachNotice(name, notice.fact);
    if (!text) return null;
    const cache: NoticeCache = { lastShownAt: new Date().toISOString(), lastKind: notice.kind };
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(cache)).catch(() => {});
    return text;
  } catch {
    return null;
  }
}

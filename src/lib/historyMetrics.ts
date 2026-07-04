// Pure derivations over workout history. No I/O — easy to reason about and test.

export interface HistorySession {
  id: string;
  workout_name: string;
  started_at: string;
  completed_at: string | null;
  total_volume_kg: number | null;
}

export interface HistorySet {
  session_id: string;
  exercise_id: string | null;
  exercise_name: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  created_at: string;
}

const DAY_MS = 86400000;

function dayStart(iso: string): number {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Current streak: consecutive days with >=1 session ending today or yesterday.
// Longest streak: max consecutive-day run anywhere in history.
export function computeStreaks(sessions: HistorySession[]): { current: number; longest: number } {
  const days = [...new Set(sessions.map((s) => dayStart(s.started_at)))].sort((a, b) => a - b);
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] - days[i - 1] === DAY_MS ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = days[days.length - 1];
  const gapDays = (today.getTime() - last) / DAY_MS;

  let current = 0;
  if (gapDays <= 1) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i] - days[i - 1] === DAY_MS) current++;
      else break;
    }
  }
  return { current, longest };
}

// Most recent logged set per exercise: { exercise_id: { weight_kg, reps } }
export function lastSetByExercise(sets: HistorySet[]): Record<string, { weight_kg: number; reps: number }> {
  const sorted = [...sets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out: Record<string, { weight_kg: number; reps: number }> = {};
  for (const s of sorted) {
    if (s.exercise_id) out[s.exercise_id] = { weight_kg: s.weight_kg, reps: s.reps };
  }
  return out;
}

export interface LastSessionPerf {
  sets: { weight_kg: number; reps: number }[];
  at: string; // date of that session (latest set's created_at)
}

// Sets from the most recent session each exercise appeared in, ordered by set_number.
export function lastSessionByExercise(sets: HistorySet[]): Record<string, LastSessionPerf> {
  // Find, per exercise, the session of its most recent set.
  const latest: Record<string, { sessionId: string; at: string }> = {};
  for (const s of sets) {
    if (!s.exercise_id) continue;
    const cur = latest[s.exercise_id];
    if (!cur || s.created_at > cur.at) {
      latest[s.exercise_id] = { sessionId: s.session_id, at: s.created_at };
    }
  }

  const out: Record<string, LastSessionPerf> = {};
  for (const [exId, { sessionId, at }] of Object.entries(latest)) {
    const sessionSets = sets
      .filter((s) => s.exercise_id === exId && s.session_id === sessionId)
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }));
    out[exId] = { sets: sessionSets, at };
  }
  return out;
}

export interface BestWeight {
  weight_kg: number;
  reps: number;
  name: string;
  at: string;
}

// All-time best weight per exercise (PR nudge + Personal Records list).
export function bestWeightByExercise(sets: HistorySet[]): Record<string, BestWeight> {
  const out: Record<string, BestWeight> = {};
  for (const s of sets) {
    if (!s.exercise_id || s.weight_kg <= 0) continue;
    if (!out[s.exercise_id] || s.weight_kg > out[s.exercise_id].weight_kg) {
      out[s.exercise_id] = { weight_kg: s.weight_kg, reps: s.reps, name: s.exercise_name, at: s.created_at };
    }
  }
  return out;
}

// Volume per ISO week (Mon-anchored) for the trailing N weeks, oldest first.
export function weeklyVolume(sessions: HistorySession[], weeks: number): { label: string; volumeKg: number }[] {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));

  const buckets: { start: Date; volumeKg: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    buckets.push({ start, volumeKg: 0 });
  }

  for (const s of sessions) {
    const t = new Date(s.started_at);
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i].start) {
        buckets[i].volumeKg += s.total_volume_kg ?? 0;
        break;
      }
    }
  }

  return buckets.map((b) => ({
    label: `${b.start.getMonth() + 1}/${b.start.getDate()}`,
    volumeKg: Math.round(b.volumeKg),
  }));
}

// Sessions per calendar day for the trailing `days` days, oldest first.
// Feeds the Progress training heatmap (index 0 = days-1 days ago).
export function dailyActivityCounts(
  sessions: HistorySession[],
  days: number
): { index: number; count: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startMs = today.getTime() - (days - 1) * DAY_MS;

  const counts = new Array(days).fill(0);
  for (const s of sessions) {
    const idx = Math.floor((dayStart(s.started_at) - startMs) / DAY_MS);
    if (idx >= 0 && idx < days) counts[idx] += 1;
  }
  return counts.map((count, index) => ({ index, count }));
}

// Exercise names the user actually trains, ranked by logged set count.
export function topExercisesBySets(sets: HistorySet[], n: number): string[] {
  const counts = new Map<string, { name: string; count: number }>();
  for (const s of sets) {
    if (s.weight_kg <= 0) continue;
    const key = s.exercise_name.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.count += 1;
    else counts.set(key, { name: s.exercise_name, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
    .map((e) => e.name);
}

// Best (heaviest) set per session for one exercise, oldest first, capped to
// the trailing `maxPoints` sessions. Feeds the strength-progression chart.
export function strengthProgression(
  sets: HistorySet[],
  exerciseName: string,
  maxPoints = 12
): { date: string; weightKg: number }[] {
  const name = exerciseName.toLowerCase();
  const bySession = new Map<string, { at: string; weightKg: number }>();
  for (const s of sets) {
    if (s.exercise_name.toLowerCase() !== name || s.weight_kg <= 0) continue;
    const cur = bySession.get(s.session_id);
    if (!cur) {
      bySession.set(s.session_id, { at: s.created_at, weightKg: s.weight_kg });
    } else {
      if (s.weight_kg > cur.weightKg) cur.weightKg = s.weight_kg;
      if (s.created_at < cur.at) cur.at = s.created_at;
    }
  }
  return [...bySession.values()]
    .sort((a, b) => a.at.localeCompare(b.at))
    .slice(-maxPoints)
    .map((p) => ({ date: p.at, weightKg: p.weightKg }));
}

export type HeatLevel = 'high' | 'moderate' | 'low' | 'none';

// Muscle-group heat over the trailing 28 days. Primary muscles get full credit,
// secondary half. Only local-library exercises contribute (edb_ ids lack muscle data).
export function muscleHeat(
  sets: HistorySet[],
  muscleLookup: (exerciseId: string) => { primary: string[]; secondary: string[] } | null
): Record<string, HeatLevel> {
  const cutoff = Date.now() - 28 * DAY_MS;
  const score: Record<string, number> = {};

  for (const s of sets) {
    if (!s.exercise_id || new Date(s.created_at).getTime() < cutoff) continue;
    const m = muscleLookup(s.exercise_id);
    if (!m) continue;
    for (const p of m.primary) score[p] = (score[p] ?? 0) + 1;
    for (const sec of m.secondary) score[sec] = (score[sec] ?? 0) + 0.5;
  }

  const values = Object.values(score);
  if (values.length === 0) return {};
  const max = Math.max(...values);

  const out: Record<string, HeatLevel> = {};
  for (const [muscle, v] of Object.entries(score)) {
    out[muscle] = v >= max * 0.66 ? 'high' : v >= max * 0.33 ? 'moderate' : 'low';
  }
  return out;
}

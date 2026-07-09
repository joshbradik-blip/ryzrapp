// Deterministic "future self" trend projections from logged history.
//
// The AI coach narrates these numbers but never computes them — LLMs are
// unreliable at precise numeric extrapolation, so all math lives here as a
// plain linear fit with a sanity-clamped weekly rate.

import { supabase } from './supabase';
import { useHistoryStore } from '../store/historyStore';

export interface TrendProjection {
  label: string;
  unit: 'kg' | '%';
  currentValue: number;
  projectedValue: number;
  weeksAhead: number;
  dataPoints: number;
  asOfDate: string; // YYYY-MM-DD
}

const MIN_POINTS = 3;
const MIN_SPAN_DAYS = 10;
const DAY_MS = 86400000;

function linearFit(points: { x: number; y: number }[]): { slope: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  return { slope: (n * sumXY - sumX * sumY) / denom };
}

/** Estimated 1-rep max via the Epley formula. */
function estimate1RM(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

function projectFromSeries(
  points: { at: string; y: number }[],
  weeksAhead: number,
  maxWeeklyRate: (current: number) => number
): { current: number; projected: number; asOfDate: string } | null {
  if (points.length < MIN_POINTS) return null;
  const sorted = [...points].sort((a, b) => a.at.localeCompare(b.at));
  const firstMs = new Date(sorted[0].at).getTime();
  const lastMs = new Date(sorted[sorted.length - 1].at).getTime();
  if (lastMs - firstMs < MIN_SPAN_DAYS * DAY_MS) return null;

  const fitPoints = sorted.map((p) => ({ x: (new Date(p.at).getTime() - firstMs) / DAY_MS, y: p.y }));
  const fit = linearFit(fitPoints);
  if (!fit) return null;

  const current = fitPoints[fitPoints.length - 1].y;
  const cap = maxWeeklyRate(current);
  const weeklyRate = Math.max(-cap, Math.min(cap, fit.slope * 7));
  const projected = Math.round((current + weeklyRate * weeksAhead) * 10) / 10;
  const asOfDate = new Date(Date.now() + weeksAhead * 7 * DAY_MS).toISOString().slice(0, 10);

  return { current: Math.round(current * 10) / 10, projected, asOfDate };
}

/**
 * Projects an exercise's estimated 1RM forward from its logged
 * heaviest-set-per-session history. Clamps weekly growth to 3% of the
 * current estimate so a short or noisy sample can't produce an absurd
 * number. Returns null when there isn't enough history yet.
 */
export function projectLiftTrend(exerciseName: string, weeksAhead = 4): TrendProjection | null {
  const { sets } = useHistoryStore.getState();
  const name = exerciseName.toLowerCase();
  const bySession = new Map<string, { at: string; est1RM: number }>();
  for (const s of sets) {
    if (s.exercise_name.toLowerCase() !== name || s.weight_kg <= 0) continue;
    const est = estimate1RM(s.weight_kg, s.reps);
    const cur = bySession.get(s.session_id);
    if (!cur || est > cur.est1RM) bySession.set(s.session_id, { at: s.created_at, est1RM: est });
  }
  const points = [...bySession.values()].map((p) => ({ at: p.at, y: p.est1RM }));
  const result = projectFromSeries(points, weeksAhead, (current) => current * 0.03);
  if (!result) return null;

  return {
    label: exerciseName,
    unit: 'kg',
    currentValue: result.current,
    projectedValue: Math.max(0, result.projected),
    weeksAhead,
    dataPoints: points.length,
    asOfDate: result.asOfDate,
  };
}

/**
 * Projects body weight or body-fat % forward from logged
 * `body_measurements`. Clamps body weight to 1% of current per week and
 * body fat to 0.4 points per week. Returns null without enough history.
 */
export async function projectBodyMetric(
  userId: string,
  metric: 'weight_kg' | 'body_fat_pct',
  weeksAhead = 4
): Promise<TrendProjection | null> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('recorded_at, weight_kg, body_fat_pct')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: true })
    .limit(200);
  if (error || !data) return null;

  const points = (data as Array<Record<string, unknown>>)
    .filter((d) => d[metric] != null)
    .map((d) => ({ at: d.recorded_at as string, y: d[metric] as number }));

  const maxWeeklyRate = metric === 'weight_kg' ? (current: number) => current * 0.01 : () => 0.4;
  const result = projectFromSeries(points, weeksAhead, maxWeeklyRate);
  if (!result) return null;

  return {
    label: metric === 'weight_kg' ? 'Body weight' : 'Body fat',
    unit: metric === 'weight_kg' ? 'kg' : '%',
    currentValue: result.current,
    projectedValue: Math.max(metric === 'body_fat_pct' ? 3 : 0, result.projected),
    weeksAhead,
    dataPoints: points.length,
    asOfDate: result.asOfDate,
  };
}

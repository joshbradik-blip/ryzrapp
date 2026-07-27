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

/**
 * Fits a clamped weekly rate to a time series. Returns the latest fitted
 * value and the sanity-capped weekly slope, or null when the sample is too
 * short/noisy to trust. Shared by every projection so the guardrails
 * (min points, min span, per-week cap) live in exactly one place.
 */
function fitSeries(
  points: { at: string; y: number }[],
  maxWeeklyRate: (current: number) => number
): { current: number; weeklyRate: number } | null {
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
  return { current, weeklyRate };
}

function daysAheadDate(weeksAhead: number): string {
  return new Date(Date.now() + weeksAhead * 7 * DAY_MS).toISOString().slice(0, 10);
}

function projectFromSeries(
  points: { at: string; y: number }[],
  weeksAhead: number,
  maxWeeklyRate: (current: number) => number
): { current: number; projected: number; asOfDate: string } | null {
  const fit = fitSeries(points, maxWeeklyRate);
  if (!fit) return null;
  const projected = Math.round((fit.current + fit.weeklyRate * weeksAhead) * 10) / 10;
  return { current: Math.round(fit.current * 10) / 10, projected, asOfDate: daysAheadDate(weeksAhead) };
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

/** Lowest body-fat % the projection will ever display — essential-fat floor. */
const BODY_FAT_FLOOR = 5;
/** Clamp body-fat change to 0.4 points/week, matching projectBodyMetric. */
const bodyFatWeeklyCap = () => 0.4;

export interface BodyFatMilestone {
  weeksAhead: number;
  projectedBf: number;
  asOfDate: string; // YYYY-MM-DD
}

export interface BodyFatOutlook {
  currentBf: number;
  milestones: BodyFatMilestone[];
  dataPoints: number;
}

/**
 * Projects logged body-fat % forward to several milestones at once (default
 * 4 / 8 / 12 weeks) from a single query, so the "Future You" silhouette can
 * morph across horizons. Uses the same clamped linear fit as every other
 * projection — a floor at essential-fat levels keeps a steep short-term
 * trend from rendering an impossible physique. Returns null when there isn't
 * enough body-fat history yet (the caller then hides the visual).
 */
export async function projectBodyFatOutlook(
  userId: string,
  weeks: number[] = [4, 8, 12]
): Promise<BodyFatOutlook | null> {
  const { data, error } = await supabase
    .from('body_measurements')
    .select('recorded_at, body_fat_pct')
    .eq('user_id', userId)
    .order('recorded_at', { ascending: true })
    .limit(200);
  if (error || !data) return null;

  const points = (data as Array<Record<string, unknown>>)
    .filter((d) => d.body_fat_pct != null)
    .map((d) => ({ at: d.recorded_at as string, y: d.body_fat_pct as number }));

  const fit = fitSeries(points, bodyFatWeeklyCap);
  if (!fit) return null;

  const round1 = (n: number) => Math.round(n * 10) / 10;
  const milestones = weeks
    .slice()
    .sort((a, b) => a - b)
    .map((w) => ({
      weeksAhead: w,
      projectedBf: Math.max(BODY_FAT_FLOOR, round1(fit.current + fit.weeklyRate * w)),
      asOfDate: daysAheadDate(w),
    }));

  return {
    currentBf: Math.max(BODY_FAT_FLOOR, round1(fit.current)),
    milestones,
    dataPoints: points.length,
  };
}

// Recovery-readiness scoring over synced wearable history. Pure — no I/O.
//
// The model is deliberately simple and transparent (WHOOP/Garmin-style inputs,
// but explainable): compare today's recovery markers against the user's own
// trailing baseline, blend into a 0–100 score.
//
//   HRV        vs 30-day baseline   weight 0.4   (higher = better recovered)
//   Resting HR vs 30-day baseline   weight 0.3   (lower  = better recovered)
//   Sleep      vs 8h target+baseline weight 0.3
//
// Only metrics the user actually has contribute — weights renormalize over
// available components. Requires ≥3 baseline days per metric so one odd
// reading can't fake a trend. Returns null when no component has enough data.

import { DailyHealthMetrics } from './health';

export type ReadinessLevel = 'high' | 'moderate' | 'low';

export interface ReadinessFactor {
  metric: 'hrv' | 'resting_hr' | 'sleep';
  label: string; // e.g. "HRV"
  detail: string; // e.g. "12% below your 30-day average"
  positive: boolean; // true = supports readiness
}

export interface ReadinessResult {
  score: number; // 0–100
  level: ReadinessLevel;
  factors: ReadinessFactor[];
  date: string; // YYYY-MM-DD the score applies to
}

const MIN_BASELINE_DAYS = 3;
const SLEEP_TARGET_MIN = 8 * 60;

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function pctDelta(today: number, baseline: number): number {
  return Math.round(((today - baseline) / baseline) * 100);
}

function fmtSleep(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m}m`;
}

/**
 * Latest value of a metric within the trailing `lookback` days (readiness is
 * about *this morning* — a watch that hasn't synced sleep yet shouldn't blank
 * the score, so we accept yesterday's reading).
 */
function latestValue(
  days: DailyHealthMetrics[],
  pick: (d: DailyHealthMetrics) => number | null,
  lookback = 2,
): { value: number; date: string } | null {
  for (let i = days.length - 1; i >= Math.max(0, days.length - lookback); i--) {
    const v = pick(days[i]);
    if (v != null && v > 0) return { value: v, date: days[i].date };
  }
  return null;
}

/** Baseline = mean over the days BEFORE the latest reading's day. */
function baselineValue(
  days: DailyHealthMetrics[],
  pick: (d: DailyHealthMetrics) => number | null,
  excludeDate: string,
): number | null {
  const values = days
    .filter((d) => d.date < excludeDate)
    .map(pick)
    .filter((v): v is number => v != null && v > 0);
  if (values.length < MIN_BASELINE_DAYS) return null;
  return mean(values);
}

/**
 * Compute today's readiness from daily metrics (oldest first, ideally the
 * trailing 30+ days). Null when no recovery metric has enough history.
 */
export function computeReadiness(days: DailyHealthMetrics[]): ReadinessResult | null {
  if (days.length === 0) return null;
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));

  const components: { score: number; weight: number; factor: ReadinessFactor }[] = [];

  // ── HRV: higher than baseline = recovered ──
  const hrv = latestValue(sorted, (d) => d.hrvMs);
  const hrvBase = hrv ? baselineValue(sorted, (d) => d.hrvMs, hrv.date) : null;
  if (hrv && hrvBase) {
    const ratio = hrv.value / hrvBase;
    const delta = pctDelta(hrv.value, hrvBase);
    components.push({
      score: clamp(70 + (ratio - 1) * 250),
      weight: 0.4,
      factor: {
        metric: 'hrv',
        label: 'HRV',
        detail:
          Math.abs(delta) < 3
            ? 'on your baseline'
            : `${Math.abs(delta)}% ${delta > 0 ? 'above' : 'below'} your baseline`,
        positive: delta >= -3,
      },
    });
  }

  // ── Resting HR: lower than baseline = recovered ──
  const rhr = latestValue(sorted, (d) => d.restingHr);
  const rhrBase = rhr ? baselineValue(sorted, (d) => d.restingHr, rhr.date) : null;
  if (rhr && rhrBase) {
    const ratio = rhr.value / rhrBase;
    const delta = pctDelta(rhr.value, rhrBase);
    components.push({
      score: clamp(70 - (ratio - 1) * 350),
      weight: 0.3,
      factor: {
        metric: 'resting_hr',
        label: 'Resting HR',
        detail:
          Math.abs(delta) < 3
            ? 'on your baseline'
            : `${Math.abs(delta)}% ${delta > 0 ? 'above' : 'below'} your baseline`,
        positive: delta <= 3,
      },
    });
  }

  // ── Sleep: vs 8h target, nudged by personal baseline when available ──
  const sleep = latestValue(sorted, (d) => d.sleepMinutes);
  if (sleep) {
    const targetScore = clamp((sleep.value / SLEEP_TARGET_MIN) * 100);
    const sleepBase = baselineValue(sorted, (d) => d.sleepMinutes, sleep.date);
    const baselineScore = sleepBase ? clamp(70 + (sleep.value / sleepBase - 1) * 150) : null;
    components.push({
      score: baselineScore != null ? targetScore * 0.6 + baselineScore * 0.4 : targetScore,
      weight: 0.3,
      factor: {
        metric: 'sleep',
        label: 'Sleep',
        detail: fmtSleep(sleep.value),
        positive: sleep.value >= 7 * 60,
      },
    });
  }

  if (components.length === 0) return null;

  const totalWeight = components.reduce((s, c) => s + c.weight, 0);
  const score = Math.round(
    components.reduce((s, c) => s + c.score * (c.weight / totalWeight), 0),
  );
  const level: ReadinessLevel = score >= 70 ? 'high' : score >= 45 ? 'moderate' : 'low';

  return {
    score,
    level,
    factors: components.map((c) => c.factor),
    date: sorted[sorted.length - 1].date,
  };
}

/** Compact plain-text block for AI prompts, or null when there's no signal. */
export function readinessPromptContext(r: ReadinessResult | null): string | null {
  if (!r) return null;
  const factorLines = r.factors.map((f) => `${f.label} ${f.detail}`).join('; ');
  const guidance =
    r.level === 'low'
      ? 'Under-recovered: do NOT push personal records or add load today. Favor technique, controlled tempo, and slightly reduced volume/intensity (about one RPE lower).'
      : r.level === 'moderate'
        ? 'Moderately recovered: train as planned, progress conservatively.'
        : 'Well recovered: green-light ambitious but sensible progression today.';
  return `Wearable readiness today: ${r.score}/100 (${r.level}). ${factorLines}. ${guidance}`;
}

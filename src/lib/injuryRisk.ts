// Predictive injury-risk signal — deterministic, no AI involved in the math.
//
// Correlates rising training volume on a joint/body part (using each
// exercise's `contraindications` tags — the same vocabulary as Injury.body_part)
// against a declining recovery trend and any injury the user has already
// reported for that area. The AI coach may narrate this, but never computes it.

import { useHistoryStore } from '../store/historyStore';
import { useWearablesStore } from '../store/wearablesStore';
import { useProfileStore } from '../store/profileStore';
import { getExerciseById } from '../constants/exercises';
import { computeReadiness } from './readiness';
import { HistorySet } from './historyMetrics';

export type RiskLevel = 'elevated' | 'moderate' | 'low';

export interface JointRiskSignal {
  bodyPart: string; // matches Exercise.contraindications / Injury.body_part vocabulary
  label: string;
  volumeChangePct: number | null; // trailing 7d volume vs prior 3-week weekly average
  sessionsInWindow: number; // sessions touching this joint in the trailing 7 days
  recoveryTrend: 'down' | 'flat' | 'up' | 'unknown';
  hasReportedInjury: boolean;
  riskLevel: RiskLevel;
  reasons: string[];
}

const DAY_MS = 86400000;
const RECENT_WINDOW_MS = 7 * DAY_MS;
const BASELINE_WINDOW_MS = 28 * DAY_MS;

const BODY_PARTS = ['lower_back', 'knees', 'shoulders', 'wrists', 'elbows', 'neck', 'hips', 'ankles'];
const LABELS: Record<string, string> = {
  lower_back: 'Lower back', knees: 'Knees', shoulders: 'Shoulders', wrists: 'Wrists',
  elbows: 'Elbows', neck: 'Neck', hips: 'Hips', ankles: 'Ankles',
};

// Injury body parts distinguish left/right shoulder; contraindications don't.
function injuryTouchesBodyPart(injuryBodyPart: string, bodyPart: string): boolean {
  if (injuryBodyPart === bodyPart) return true;
  return bodyPart === 'shoulders' && (injuryBodyPart === 'left_shoulder' || injuryBodyPart === 'right_shoulder');
}

function windowVolume(sets: HistorySet[], bodyPart: string, fromMs: number, toMs: number) {
  let volumeKg = 0;
  const sessions = new Set<string>();
  for (const s of sets) {
    if (s.weight_kg <= 0 || !s.exercise_id) continue;
    const ex = getExerciseById(s.exercise_id);
    if (!ex || !ex.contraindications.includes(bodyPart)) continue;
    const t = new Date(s.created_at).getTime();
    if (t >= fromMs && t < toMs) {
      volumeKg += s.weight_kg * s.reps;
      sessions.add(s.session_id);
    }
  }
  return { volumeKg, sessionCount: sessions.size };
}

/** Recovery direction: last 3 readiness-scored days vs the 7 before that. */
function recoveryTrend(): 'down' | 'flat' | 'up' | 'unknown' {
  const history = [...useWearablesStore.getState().history].sort((a, b) => a.date.localeCompare(b.date));
  if (history.length < 5) return 'unknown';

  const scores: number[] = [];
  for (let i = 3; i < history.length; i++) {
    const r = computeReadiness(history.slice(0, i + 1));
    if (r) scores.push(r.score);
  }
  if (scores.length < 4) return 'unknown';

  const recent = scores.slice(-3);
  const prior = scores.slice(-10, -3);
  if (prior.length === 0) return 'unknown';

  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const priorAvg = prior.reduce((a, b) => a + b, 0) / prior.length;
  const delta = recentAvg - priorAvg;
  if (delta <= -6) return 'down';
  if (delta >= 6) return 'up';
  return 'flat';
}

/**
 * Assesses injury risk per joint/body part from logged training volume,
 * recovery trend, and reported injuries. Returns only joints with a
 * moderate-or-higher signal, most severe first.
 */
export function assessInjuryRisk(): JointRiskSignal[] {
  const { sets } = useHistoryStore.getState();
  const { injuries } = useProfileStore.getState();
  const now = Date.now();
  const trend = recoveryTrend();

  const signals: JointRiskSignal[] = [];

  for (const bodyPart of BODY_PARTS) {
    const recent = windowVolume(sets, bodyPart, now - RECENT_WINDOW_MS, now);
    const baseline = windowVolume(sets, bodyPart, now - BASELINE_WINDOW_MS, now - RECENT_WINDOW_MS);
    const baselineWeeklyAvg = baseline.volumeKg / 3;

    if (recent.sessionCount === 0) continue; // not currently training this joint

    const volumeChangePct = baselineWeeklyAvg > 10 ? Math.round(((recent.volumeKg - baselineWeeklyAvg) / baselineWeeklyAvg) * 100) : null;
    const reportedInjury = injuries.find((i) => injuryTouchesBodyPart(i.body_part, bodyPart));
    const hasReportedInjury = !!reportedInjury;

    let score = 0;
    const reasons: string[] = [];
    const label = LABELS[bodyPart];

    if (volumeChangePct != null && volumeChangePct >= 30) {
      score += 2;
      reasons.push(`${label} volume up ${volumeChangePct}% this week vs your recent average`);
    } else if (volumeChangePct != null && volumeChangePct >= 15) {
      score += 1;
      reasons.push(`${label} volume up ${volumeChangePct}% this week vs your recent average`);
    }

    if (trend === 'down') {
      score += 1;
      reasons.push('Your recovery trend has been dropping the last few days');
    }

    if (hasReportedInjury) {
      score += 2;
      reasons.push(`You've reported ${label.toLowerCase()} issues before (${reportedInjury!.severity.replace('_', ' ')})`);
    }

    if (recent.sessionCount >= 3) {
      score += 1;
      reasons.push(`Trained ${label.toLowerCase()}-loading exercises ${recent.sessionCount}x in the last 7 days`);
    }

    const riskLevel: RiskLevel = score >= 3 ? 'elevated' : score >= 1 ? 'moderate' : 'low';
    if (riskLevel === 'low') continue;

    signals.push({
      bodyPart,
      label,
      volumeChangePct,
      sessionsInWindow: recent.sessionCount,
      recoveryTrend: trend,
      hasReportedInjury,
      riskLevel,
      reasons,
    });
  }

  return signals.sort((a, b) => (b.riskLevel === 'elevated' ? 1 : 0) - (a.riskLevel === 'elevated' ? 1 : 0));
}

// Deterministic, on-device form checks.
//
// These run per rep with zero network calls, so a cue lands in the same
// second the rep happens instead of two seconds later. Every threshold that
// could depend on how far away the user is standing is divided by torso
// scale first, which is what lets the same rule work at two feet and at ten.
//
// Claude is still used for coaching (see summarizeSetForCoach) — but on the
// numbers this produces, not on raw photos. It gets a compact, accurate
// description of what the body actually did rather than a dim JPEG to squint at.

import type { PoseFrame, Landmarks } from './types';
import type { RepEvent } from './repDetector';
import type { ExerciseProfile } from './profiles';
import { measureAngle } from './profiles';
import {
  joint, midpoint, angleFromVertical, signedDistanceToLine,
  torsoScale, dist, clamp, jointAngle,
} from './geometry';

export interface Finding {
  id: string;
  /** Short, imperative, safe to speak. Max ~12 words. */
  cue: string;
  /** Points off the rep's form score. */
  penalty: number;
}

export interface RepContext {
  profile: ExerciseProfile;
  event: RepEvent;
  /** Frame at the deepest point of the rep. */
  bottomFrame: PoseFrame | null;
  /** Frame at the start (top) of the rep. */
  topFrame: PoseFrame | null;
}

type Rule = (ctx: RepContext) => Finding | null;

/** Both-sides angle at a named joint, or null. */
function sideAngles(lm: Landmarks, chain: [string, string, string]): { left: number | null; right: number | null } {
  const [a, b, c] = chain;
  return {
    left: jointAngle(lm, `left_${a}` as any, `left_${b}` as any, `left_${c}` as any),
    right: jointAngle(lm, `right_${a}` as any, `right_${b}` as any, `right_${c}` as any),
  };
}

const RULES: Record<string, Rule> = {
  // ── Depth ──────────────────────────────────────────────────────────────
  squat_depth: ({ event }) => {
    if (event.peakDepth >= 0.85) return null;
    const shallow = event.peakDepth < 0.68;
    return {
      id: 'squat_depth',
      cue: shallow
        ? 'Sink deeper — get your thighs to parallel.'
        : 'Almost there — a touch more depth.',
      penalty: shallow ? 18 : 8,
    };
  },

  partial_rom: ({ event, profile }) => {
    if (event.peakDepth >= profile.minRom + 0.18) return null;
    return {
      id: 'partial_rom',
      cue: 'Use the full range — all the way down, all the way up.',
      penalty: 12,
    };
  },

  lockout: ({ event }) => {
    // Did the top of the rep actually return to the start position? Read the
    // thresholds off the source that was actually measured — with a fallback
    // angle latched, the profile's own degrees mean nothing here.
    const { topAngle, bottomAngle } = event.source;
    const span = Math.abs(topAngle - bottomAngle);
    if (span < 1e-6) return null;
    const reached = topAngle > bottomAngle ? event.maxAngle : event.minAngle;
    const shortfall = Math.abs(topAngle - reached) / span;
    if (shortfall < 0.14) return null;
    return {
      id: 'lockout',
      cue: 'Finish the rep — lock out fully at the top.',
      penalty: 12,
    };
  },

  // ── Knees ──────────────────────────────────────────────────────────────
  // Mirror-independent: compare knee separation against ankle separation
  // rather than absolute left/right positions, so it does not matter which
  // way the camera is facing or whether the preview is flipped.
  knee_valgus: ({ bottomFrame }) => {
    if (!bottomFrame) return null;
    const lm = bottomFrame.landmarks;
    const lk = joint(lm, 'left_knee');
    const rk = joint(lm, 'right_knee');
    const la = joint(lm, 'left_ankle');
    const ra = joint(lm, 'right_ankle');
    if (!lk || !rk || !la || !ra) return null;

    const kneeGap = Math.abs(lk.x - rk.x);
    const ankleGap = Math.abs(la.x - ra.x);
    if (ankleGap < 1e-3) return null;

    const ratio = kneeGap / ankleGap;
    if (ratio >= 0.82) return null;
    return {
      id: 'knee_valgus',
      cue: 'Push your knees out in line with your toes.',
      penalty: ratio < 0.65 ? 22 : 12,
    };
  },

  // ── Torso ──────────────────────────────────────────────────────────────
  torso_lean: ({ bottomFrame }) => {
    if (!bottomFrame) return null;
    const lm = bottomFrame.landmarks;
    const ls = joint(lm, 'left_shoulder');
    const rs = joint(lm, 'right_shoulder');
    const lh = joint(lm, 'left_hip');
    const rh = joint(lm, 'right_hip');
    const shoulder = ls && rs ? midpoint(ls, rs) : (ls ?? rs);
    const hip = lh && rh ? midpoint(lh, rh) : (lh ?? rh);
    if (!shoulder || !hip) return null;

    const lean = angleFromVertical(hip, shoulder);
    if (lean < 45) return null;
    return {
      id: 'torso_lean',
      cue: 'Keep your chest up — you\'re folding forward.',
      penalty: lean > 60 ? 18 : 10,
    };
  },

  hinge_back_round: ({ bottomFrame }) => {
    if (!bottomFrame) return null;
    const knee = measureAngle(bottomFrame.landmarks, 'knee');
    if (!knee) return null;
    // A hinge that collapses into a deep knee bend is a squat, not a hinge.
    if (knee.value > 125) return null;
    return {
      id: 'hinge_back_round',
      cue: 'Push your hips back — you\'re squatting it, not hinging.',
      penalty: 15,
    };
  },

  // ── Plank / push-up line ───────────────────────────────────────────────
  hip_sag: ({ bottomFrame }) => {
    if (!bottomFrame) return null;
    const lm = bottomFrame.landmarks;
    const scale = torsoScale(lm);
    if (!scale) return null;

    const ls = joint(lm, 'left_shoulder');
    const rs = joint(lm, 'right_shoulder');
    const lh = joint(lm, 'left_hip');
    const rh = joint(lm, 'right_hip');
    const shoulder = ls && rs ? midpoint(ls, rs) : (ls ?? rs);
    const hip = lh && rh ? midpoint(lh, rh) : (lh ?? rh);
    // Prefer ankles, fall back to knees — a phone close to the floor often
    // only catches the upper half of the body.
    const la = joint(lm, 'left_ankle') ?? joint(lm, 'left_knee');
    const ra = joint(lm, 'right_ankle') ?? joint(lm, 'right_knee');
    const foot = la && ra ? midpoint(la, ra) : (la ?? ra);
    if (!shoulder || !hip || !foot) return null;

    // Ignore near-degenerate lines (body pointing at the camera).
    if (dist(shoulder, foot) < scale * 0.8) return null;

    const offset = signedDistanceToLine(hip, shoulder, foot) / scale;
    const magnitude = Math.abs(offset);
    if (magnitude < 0.22) return null;

    // Which side of the line the hip sits on tells sag from pike. In image
    // coords y grows downward, so a hip below the line reads as one sign
    // consistently for a given body orientation; compare against the head to
    // decide rather than assuming.
    const nose = joint(lm, 'nose');
    const headOffset = nose ? signedDistanceToLine(nose, shoulder, foot) / scale : 0;
    const piked = headOffset !== 0 && Math.sign(offset) === Math.sign(headOffset);

    return {
      id: 'hip_sag',
      cue: piked
        ? 'Drop your hips — you\'re piking up.'
        : 'Squeeze your glutes — stop your hips sagging.',
      penalty: magnitude > 0.35 ? 18 : 10,
    };
  },

  // ── Elbows ─────────────────────────────────────────────────────────────
  elbow_drift: ({ topFrame, bottomFrame }) => {
    if (!topFrame || !bottomFrame) return null;
    const scale = torsoScale(bottomFrame.landmarks) ?? torsoScale(topFrame.landmarks);
    if (!scale) return null;

    let worst = 0;
    for (const side of ['left', 'right'] as const) {
      const eTop = joint(topFrame.landmarks, `${side}_elbow` as any);
      const eBot = joint(bottomFrame.landmarks, `${side}_elbow` as any);
      const sTop = joint(topFrame.landmarks, `${side}_shoulder` as any);
      const sBot = joint(bottomFrame.landmarks, `${side}_shoulder` as any);
      if (!eTop || !eBot || !sTop || !sBot) continue;
      // Elbow position relative to its own shoulder, so the check survives
      // the whole body shifting in frame.
      const relTop = { x: eTop.x - sTop.x, y: eTop.y - sTop.y };
      const relBot = { x: eBot.x - sBot.x, y: eBot.y - sBot.y };
      worst = Math.max(worst, dist(relTop, relBot) / scale);
    }
    if (worst < 0.3) return null;
    return {
      id: 'elbow_drift',
      cue: 'Pin your elbows to your sides — they\'re swinging.',
      penalty: worst > 0.5 ? 16 : 9,
    };
  },

  // ── Tempo & symmetry ───────────────────────────────────────────────────
  tempo_fast: ({ event }) => {
    if (event.eccentricMs >= 500) return null;
    return {
      id: 'tempo_fast',
      cue: 'Slow the way down — control it for two seconds.',
      penalty: event.eccentricMs < 300 ? 12 : 6,
    };
  },

  asymmetry: ({ bottomFrame, profile }) => {
    if (!bottomFrame) return null;
    const chain: Record<string, [string, string, string]> = {
      knee: ['hip', 'knee', 'ankle'],
      elbow: ['shoulder', 'elbow', 'wrist'],
      hip: ['shoulder', 'hip', 'knee'],
      shoulder: ['hip', 'shoulder', 'elbow'],
    };
    const { left, right } = sideAngles(bottomFrame.landmarks, chain[profile.primaryAngle]);
    if (left === null || right === null) return null;
    const diff = Math.abs(left - right);
    if (diff < 18) return null;
    return {
      id: 'asymmetry',
      cue: 'Even it out — one side is working harder than the other.',
      penalty: diff > 30 ? 14 : 8,
    };
  },
};

export interface RepAnalysis {
  score: number;
  findings: Finding[];
  /** Highest-penalty cue, or null when the rep was clean. */
  topCue: string | null;
}

export function analyzeRep(ctx: RepContext): RepAnalysis {
  const findings: Finding[] = [];
  for (const id of ctx.profile.rules) {
    const rule = RULES[id];
    if (!rule) continue;
    try {
      const finding = rule(ctx);
      if (finding) findings.push(finding);
    } catch {
      // A rule must never take the session down.
    }
  }

  findings.sort((a, b) => b.penalty - a.penalty);
  const totalPenalty = findings.reduce((s, f) => s + f.penalty, 0);

  // Tracking quality scales the penalty: we do not hand out harsh scores on
  // frames we were barely confident about in the first place.
  const confidence = clamp(ctx.event.quality, 0, 1);
  const applied = totalPenalty * (0.4 + 0.6 * confidence);

  return {
    score: Math.round(clamp(100 - applied, 35, 100)),
    findings,
    topCue: findings.length > 0 ? findings[0].cue : null,
  };
}

export { RULES as FORM_RULES };

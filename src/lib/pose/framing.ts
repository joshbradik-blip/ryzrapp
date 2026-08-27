// Framing / trackability coach.
//
// The old Form Coach failed silently: bad light or a bad angle just produced
// "Can't see you clearly" and a rep count that quietly stopped moving. The
// user had no idea whether to move, turn, or turn a light on.
//
// This module answers a different question — not "is the shot perfect" but
// "can I track THIS exercise right now, and if not, what is the one thing to
// change". Requirements are per-exercise and minimal, so a curl filmed from
// two feet away passes even though a squat from the same spot would not.

import type { Landmarks, PoseFrame } from './types';
import { MIN_KEYPOINT_SCORE, GOOD_KEYPOINT_SCORE, isVisible, isInFrame } from './types';
import { boundingBox, meanScore, joint } from './geometry';
import type { ExerciseProfile } from './profiles';
import { angleSources, jointsForAngle } from './profiles';

export type FramingCode =
  | 'ok'
  | 'no_person'
  | 'too_dark'
  | 'low_confidence'
  | 'too_close'
  | 'too_far'
  | 'missing_joints'
  | 'edge_of_frame';

export type FramingSeverity = 'ok' | 'warn' | 'blocking';

export interface FramingResult {
  code: FramingCode;
  severity: FramingSeverity;
  /** One short sentence, imperative, safe to speak aloud. */
  message: string;
  /** True when we have enough to count reps, even if the shot is imperfect. */
  trackable: boolean;
  /** 0..1 — how confident the tracking is right now. Drives the UI meter. */
  quality: number;
  /** Offer the torch button when the problem is darkness. */
  suggestTorch: boolean;
  /** Base joint names the profile wanted but could not see. */
  missing: string[];
}

/**
 * A base joint name counts as usable if EITHER side is detected AND inside
 * the frame.
 *
 * The in-frame part matters: detectors happily extrapolate a knee to y = 1.12,
 * i.e. below the bottom edge. Treating that as "visible" is how the old coach
 * ended up confidently tracking a body it could only half see.
 */
export function jointVisible(
  lm: Landmarks,
  base: string,
  minScore = MIN_KEYPOINT_SCORE,
  xMax = 1
): boolean {
  return (
    isInFrame(lm[`left_${base}` as keyof Landmarks], minScore, xMax) ||
    isInFrame(lm[`right_${base}` as keyof Landmarks], minScore, xMax)
  );
}

/**
 * Joints missing for the EASIEST angle the profile can be measured on.
 *
 * We check the primary chain and any fallback chain, and report the shortfall
 * of whichever is closest to satisfied. A squat whose ankles are out of shot
 * is not missing anything if hip angle can carry the set.
 */
export function missingJoints(
  lm: Landmarks,
  profile: ExerciseProfile,
  minScore = MIN_KEYPOINT_SCORE,
  xMax = 1
): string[] {
  let best: string[] | null = null;

  for (const source of angleSources(profile)) {
    // requiredJoints is the human-readable floor; the angle chain is what the
    // maths actually needs. A joint in requiredJoints that this chain does not
    // use (e.g. the ankle for a hip-angle fallback) must not block us.
    const chain = jointsForAngle(source.angle);
    const needed = new Set([
      ...chain,
      ...profile.requiredJoints.filter(j => chain.includes(j)),
    ]);
    const missing = [...needed].filter(base => !jointVisible(lm, base, minScore, xMax));
    if (missing.length === 0) return [];
    if (best === null || missing.length < best.length) best = missing;
  }

  return best ?? [];
}

function humanJoint(base: string): string {
  switch (base) {
    case 'hip': return 'hips';
    case 'knee': return 'knees';
    case 'ankle': return 'ankles';
    case 'shoulder': return 'shoulders';
    case 'elbow': return 'elbows';
    case 'wrist': return 'wrists';
    default: return base;
  }
}

function listJoints(bases: string[]): string {
  const names = bases.map(humanJoint);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const DARK_BRIGHTNESS = 0.18;

export interface FramingOptions {
  /** Below this mean confidence we stop trusting the skeleton. */
  minMeanScore?: number;
  /** Bounding box height below which the subject is too small to read. */
  minSubjectHeight?: number;
}

export function analyzeFraming(
  frame: PoseFrame,
  profile: ExerciseProfile,
  opts: FramingOptions = {}
): FramingResult {
  const minMeanScore = opts.minMeanScore ?? 0.25;
  const minSubjectHeight = opts.minSubjectHeight ?? 0.18;

  const lm = frame.landmarks;
  const xMax = frame.xMax ?? 1;
  const box = boundingBox(lm);
  const confidence = meanScore(lm);
  const dark = frame.brightness !== undefined && frame.brightness < DARK_BRIGHTNESS;

  // ── Nobody there ────────────────────────────────────────────────────────
  if (!box || box.count < 3) {
    if (dark) {
      return {
        code: 'too_dark',
        severity: 'blocking',
        message: "It's too dark to see you — turn on a light or tap the torch.",
        trackable: false,
        quality: 0,
        suggestTorch: true,
        missing: [],
      };
    }
    return {
      code: 'no_person',
      severity: 'blocking',
      message: 'Step into frame so I can see you.',
      trackable: false,
      quality: 0,
      suggestTorch: false,
      missing: [],
    };
  }

  const missing = missingJoints(lm, profile, MIN_KEYPOINT_SCORE, xMax);

  // ── Darkness, when it is actually costing us the skeleton ───────────────
  // Dark alone is fine if the detector is still confident — plenty of gyms
  // are dim and track perfectly well.
  if (dark && confidence < GOOD_KEYPOINT_SCORE) {
    return {
      code: 'too_dark',
      severity: 'blocking',
      message: 'Too dark to read your position — add some light or tap the torch.',
      trackable: false,
      quality: confidence,
      suggestTorch: true,
      missing,
    };
  }

  // ── Subject too small to resolve ────────────────────────────────────────
  if (box.height < minSubjectHeight) {
    return {
      code: 'too_far',
      severity: 'blocking',
      message: "You're too far away — come closer or move the phone back toward you.",
      trackable: false,
      quality: Math.min(confidence, box.height / minSubjectHeight),
      suggestTorch: false,
      missing,
    };
  }

  // ── Required joints out of shot ─────────────────────────────────────────
  if (missing.length > 0) {
    // Distinguish "cropped out of frame" from "not detected at all", because
    // the fix is different: move the phone vs. turn to face it.
    const cropped = missing.some(base => {
      const l = lm[`left_${base}` as keyof Landmarks];
      const r = lm[`right_${base}` as keyof Landmarks];
      return [l, r].some(kp => kp && (kp.x < 0 || kp.x > xMax || kp.y < 0 || kp.y > 1));
    });

    return {
      code: cropped ? 'too_close' : 'missing_joints',
      severity: 'blocking',
      message: cropped
        ? `Step back a little — I can't see your ${listJoints(missing)}.`
        : `I can't pick up your ${listJoints(missing)}. ${profile.framingTip}`,
      trackable: false,
      quality: confidence * 0.5,
      suggestTorch: false,
      missing,
    };
  }

  // From here on we CAN track. Everything below is advisory only — it must
  // never stop the rep counter.

  // ── Drifting toward the edge ────────────────────────────────────────────
  const nearEdge = box.x0 < 0.02 * xMax || box.x1 > 0.98 * xMax || box.y0 < 0.02 || box.y1 > 0.98;
  if (nearEdge) {
    return {
      code: 'edge_of_frame',
      severity: 'warn',
      message: "You're drifting out of frame — recenter when you get a chance.",
      trackable: true,
      quality: Math.max(0.4, confidence * 0.8),
      suggestTorch: false,
      missing: [],
    };
  }

  // ── Shaky but usable ────────────────────────────────────────────────────
  if (confidence < minMeanScore) {
    return {
      code: 'low_confidence',
      severity: 'warn',
      message: dark
        ? 'Tracking is shaky in this light — reps may be off.'
        : 'Tracking is shaky — a plainer background or tighter clothing helps.',
      trackable: true,
      quality: confidence,
      suggestTorch: dark,
      missing: [],
    };
  }

  return {
    code: 'ok',
    severity: 'ok',
    message: 'Tracking you.',
    trackable: true,
    quality: Math.min(1, confidence),
    suggestTorch: false,
    missing: [],
  };
}

/**
 * Which way the user is facing, inferred from shoulder separation relative to
 * torso height. Used only to nudge toward the profile's preferred view — we
 * never refuse to track because of it.
 */
export function inferredView(lm: Landmarks): 'side' | 'front' | 'unknown' {
  const ls = joint(lm, 'left_shoulder');
  const rs = joint(lm, 'right_shoulder');
  const lh = joint(lm, 'left_hip');
  const rh = joint(lm, 'right_hip');
  if (!ls || !rs || (!lh && !rh)) return 'unknown';
  const hipY = lh && rh ? (lh.y + rh.y) / 2 : (lh ?? rh)!.y;
  const torsoHeight = Math.abs(hipY - (ls.y + rs.y) / 2);
  if (torsoHeight < 1e-4) return 'unknown';
  const shoulderWidth = Math.abs(ls.x - rs.x);
  const ratio = shoulderWidth / torsoHeight;
  if (ratio < 0.35) return 'side';
  if (ratio > 0.7) return 'front';
  return 'unknown';
}

// Per-exercise movement profiles.
//
// A profile says three things: which joint angle a rep is measured on, what
// that angle reads at the top and bottom of the movement, and the smallest
// set of joints we need to see in order to count anything at all.
//
// That last one is the point. The old Form Coach asked for a full head-to-toe
// body shot for every exercise, which is why it needed six feet of clear
// floor. A bicep curl only ever needed a shoulder, an elbow and a wrist —
// so on this profile it works with the phone on a bench two feet away.

import type { Landmarks, Side } from './types';
import { bilateralAngle, clamp } from './geometry';

/** Which three landmarks form the measured angle. */
export type AngleKey = 'knee' | 'elbow' | 'hip' | 'shoulder';

const ANGLE_CHAIN: Record<AngleKey, [string, string, string]> = {
  // vertex is the middle entry
  knee: ['hip', 'knee', 'ankle'],
  elbow: ['shoulder', 'elbow', 'wrist'],
  hip: ['shoulder', 'hip', 'knee'],
  shoulder: ['hip', 'shoulder', 'elbow'],
};

/** Base (unsided) landmark names an angle needs. */
export function jointsForAngle(key: AngleKey): string[] {
  return ANGLE_CHAIN[key];
}

export function measureAngle(
  lm: Landmarks,
  key: AngleKey,
  minScore?: number
): { value: number; sides: Side[] } | null {
  const [a, b, c] = ANGLE_CHAIN[key];
  return bilateralAngle(lm, a, b, c, minScore);
}

export type FormRuleId =
  | 'squat_depth'
  | 'knee_valgus'
  | 'torso_lean'
  | 'hip_sag'
  | 'elbow_drift'
  | 'lockout'
  | 'tempo_fast'
  | 'asymmetry'
  | 'hinge_back_round'
  | 'partial_rom';

export interface ExerciseProfile {
  id: string;
  label: string;
  /** Matched case-insensitively against the exercise name. */
  patterns: RegExp[];
  /** Camera angle that reads best. Advisory only — never enforced. */
  preferredView: 'side' | 'front' | 'any';
  primaryAngle: AngleKey;
  /** Measured angle in degrees at the top / start of the movement. */
  topAngle: number;
  /** Measured angle in degrees at the bottom / peak contraction. */
  bottomAngle: number;
  /**
   * Base landmark names needed to count reps. Each must be visible on at
   * least one side — never both. Keep this list as short as the movement
   * genuinely allows.
   */
  requiredJoints: string[];
  /** Extra joints that unlock richer form rules when they happen to be visible. */
  bonusJoints: string[];
  /** Fraction of the top→bottom range a rep must cover to be counted. */
  minRom: number;
  rules: FormRuleId[];
  /** Shown once, in plain language, when framing is the blocker. */
  framingTip: string;
  /** Isometric holds are timed, not counted. */
  isHold?: boolean;
  /**
   * A second joint angle that tracks the same movement, used when the primary
   * one is unmeasurable.
   *
   * This is what lets a squat keep counting when the camera cannot see the
   * user's feet — knee angle needs an ankle, but hip angle does not, and both
   * describe the same descent. Without this, "I can see your hips and knees"
   * would still be a dead end, which was the original problem.
   */
  fallback?: AngleSource;
}

/** A measurable angle plus what it reads at the top and bottom of the rep. */
export interface AngleSource {
  angle: AngleKey;
  topAngle: number;
  bottomAngle: number;
}

export const PROFILES: ExerciseProfile[] = [
  {
    id: 'squat',
    label: 'Squat',
    patterns: [/squat/i, /leg press/i, /wall sit/i],
    preferredView: 'side',
    primaryAngle: 'knee',
    topAngle: 172,
    bottomAngle: 72,
    requiredJoints: ['hip', 'knee'],
    bonusJoints: ['ankle', 'shoulder'],
    minRom: 0.55,
    rules: ['squat_depth', 'knee_valgus', 'torso_lean', 'tempo_fast', 'asymmetry'],
    framingTip: 'Side-on works best, but I only need to see your hips and knees.',
    // Hip flexion tracks the same descent without needing the ankles in shot.
    fallback: { angle: 'hip', topAngle: 168, bottomAngle: 62 },
  },
  {
    id: 'hinge',
    label: 'Hip hinge',
    patterns: [/deadlift/i, /romanian/i, /\brdl\b/i, /good ?morning/i, /hip hinge/i, /kettlebell swing/i],
    preferredView: 'side',
    primaryAngle: 'hip',
    topAngle: 170,
    bottomAngle: 95,
    requiredJoints: ['shoulder', 'hip'],
    bonusJoints: ['knee', 'ankle'],
    minRom: 0.5,
    rules: ['hinge_back_round', 'lockout', 'tempo_fast', 'partial_rom'],
    framingTip: 'Stand side-on so I can see your back angle. Shoulders and hips are enough.',
  },
  {
    id: 'lunge',
    label: 'Lunge',
    patterns: [/lunge/i, /split squat/i, /step ?-?up/i, /bulgarian/i],
    preferredView: 'side',
    primaryAngle: 'knee',
    topAngle: 168,
    bottomAngle: 85,
    requiredJoints: ['hip', 'knee'],
    bonusJoints: ['ankle', 'shoulder'],
    minRom: 0.5,
    rules: ['torso_lean', 'knee_valgus', 'tempo_fast'],
    framingTip: 'Side-on is ideal. Hips and knees in frame is all I need.',
    fallback: { angle: 'hip', topAngle: 170, bottomAngle: 95 },
  },
  {
    id: 'pushup',
    label: 'Push-up',
    patterns: [/push ?-?up/i, /press ?-?up/i, /dip\b/i],
    preferredView: 'side',
    primaryAngle: 'elbow',
    topAngle: 168,
    bottomAngle: 80,
    requiredJoints: ['shoulder', 'elbow'],
    bonusJoints: ['wrist', 'hip', 'ankle'],
    minRom: 0.5,
    rules: ['hip_sag', 'partial_rom', 'tempo_fast', 'asymmetry'],
    framingTip: 'Put the phone on the floor to your side, a couple of feet away.',
    // Wrists are often out of shot on the floor; shoulder flexion still moves.
    fallback: { angle: 'shoulder', topAngle: 75, bottomAngle: 30 },
  },
  {
    id: 'horizontal_press',
    label: 'Press',
    patterns: [/bench/i, /chest press/i, /floor press/i],
    preferredView: 'side',
    primaryAngle: 'elbow',
    topAngle: 168,
    bottomAngle: 75,
    requiredJoints: ['shoulder', 'elbow'],
    bonusJoints: ['wrist'],
    minRom: 0.5,
    rules: ['lockout', 'tempo_fast', 'asymmetry', 'partial_rom'],
    framingTip: 'Phone beside the bench at chest height. Upper body only is fine.',
  },
  {
    id: 'overhead_press',
    label: 'Overhead press',
    patterns: [/overhead/i, /shoulder press/i, /military/i, /push press/i, /\bohp\b/i],
    preferredView: 'front',
    primaryAngle: 'elbow',
    topAngle: 172,
    bottomAngle: 70,
    requiredJoints: ['shoulder', 'elbow'],
    bonusJoints: ['wrist', 'hip'],
    minRom: 0.55,
    rules: ['lockout', 'torso_lean', 'asymmetry', 'tempo_fast'],
    framingTip: 'Face the camera. I need your shoulders and elbows — not your feet.',
  },
  {
    id: 'row',
    label: 'Row',
    patterns: [/row\b/i, /face pull/i, /rear delt/i],
    preferredView: 'side',
    primaryAngle: 'elbow',
    topAngle: 165,
    bottomAngle: 70,
    requiredJoints: ['shoulder', 'elbow'],
    bonusJoints: ['wrist', 'hip'],
    minRom: 0.45,
    rules: ['tempo_fast', 'asymmetry', 'partial_rom'],
    framingTip: 'Side-on. Shoulders and elbows in frame is enough.',
  },
  {
    id: 'curl',
    label: 'Curl',
    patterns: [/curl/i],
    preferredView: 'front',
    primaryAngle: 'elbow',
    topAngle: 165,
    bottomAngle: 55,
    requiredJoints: ['shoulder', 'elbow'],
    bonusJoints: ['wrist', 'hip'],
    minRom: 0.5,
    rules: ['elbow_drift', 'partial_rom', 'tempo_fast', 'asymmetry'],
    framingTip: 'Face the camera. Prop the phone anywhere it can see your arms.',
  },
  {
    id: 'vertical_pull',
    label: 'Pull-down',
    patterns: [/pull ?-?up/i, /chin ?-?up/i, /pull ?-?down/i, /lat pull/i],
    preferredView: 'front',
    primaryAngle: 'elbow',
    topAngle: 168,
    bottomAngle: 65,
    requiredJoints: ['shoulder', 'elbow'],
    bonusJoints: ['wrist'],
    minRom: 0.5,
    rules: ['partial_rom', 'tempo_fast', 'asymmetry'],
    framingTip: 'Face the camera. Upper body in frame is all I need.',
  },
  {
    id: 'hip_thrust',
    label: 'Hip thrust',
    patterns: [/hip thrust/i, /glute bridge/i, /bridge/i],
    preferredView: 'side',
    // Hip angle opens as you lock out, so bottom > top here. The depth
    // formula handles either direction.
    primaryAngle: 'hip',
    topAngle: 95,
    bottomAngle: 172,
    requiredJoints: ['shoulder', 'hip', 'knee'],
    bonusJoints: ['ankle'],
    minRom: 0.5,
    rules: ['lockout', 'tempo_fast'],
    framingTip: 'Phone on the floor to your side. Shoulders through knees.',
  },
  {
    id: 'lateral_raise',
    label: 'Lateral raise',
    patterns: [/lateral raise/i, /side raise/i, /front raise/i, /\bfly\b/i, /flye/i],
    preferredView: 'front',
    primaryAngle: 'shoulder',
    topAngle: 20,
    bottomAngle: 90,
    requiredJoints: ['hip', 'shoulder', 'elbow'],
    bonusJoints: ['wrist'],
    minRom: 0.5,
    rules: ['asymmetry', 'tempo_fast', 'partial_rom'],
    framingTip: 'Face the camera from a few steps back so your arms stay in frame.',
  },
  {
    id: 'plank',
    label: 'Plank',
    patterns: [/plank/i, /hollow hold/i, /dead ?bug/i],
    preferredView: 'side',
    primaryAngle: 'hip',
    topAngle: 175,
    bottomAngle: 140,
    requiredJoints: ['shoulder', 'hip'],
    bonusJoints: ['knee', 'ankle'],
    minRom: 1,
    rules: ['hip_sag'],
    framingTip: 'Phone on the floor to your side.',
    isHold: true,
  },
];

/** Generic fallback for anything we do not have a profile for. */
export const GENERIC_PROFILE: ExerciseProfile = {
  id: 'generic',
  label: 'Movement',
  patterns: [],
  preferredView: 'any',
  primaryAngle: 'elbow',
  topAngle: 165,
  bottomAngle: 75,
  requiredJoints: ['shoulder', 'elbow'],
  bonusJoints: ['hip', 'knee', 'wrist'],
  minRom: 0.5,
  rules: ['tempo_fast', 'asymmetry'],
  framingTip: 'Prop the phone where it can see the joints that are moving.',
};

/** Primary source first, then any fallback. */
export function angleSources(profile: ExerciseProfile): AngleSource[] {
  const primary: AngleSource = {
    angle: profile.primaryAngle,
    topAngle: profile.topAngle,
    bottomAngle: profile.bottomAngle,
  };
  return profile.fallback ? [primary, profile.fallback] : [primary];
}

/**
 * Pick the best angle source measurable in this frame. Callers should latch
 * the choice for the duration of a set — switching sources mid-rep would step
 * the depth signal and fabricate a rep boundary.
 */
export function resolveAngleSource(
  lm: Landmarks,
  profile: ExerciseProfile,
  minScore?: number
): { source: AngleSource; value: number } | null {
  for (const source of angleSources(profile)) {
    const measured = measureAngle(lm, source.angle, minScore);
    if (measured) return { source, value: measured.value };
  }
  return null;
}

export function profileFor(exerciseName: string): ExerciseProfile {
  for (const p of PROFILES) {
    if (p.patterns.some(re => re.test(exerciseName))) return p;
  }
  return GENERIC_PROFILE;
}

/**
 * Normalized movement depth: 0 at the top of the rep, 1 at the bottom.
 * Values are clamped a little past both ends so we can still tell "went
 * deeper than a textbook rep" from "exactly at the bottom".
 */
export function depthFrom(source: AngleSource, angle: number): number {
  const span = source.topAngle - source.bottomAngle;
  if (Math.abs(span) < 1e-6) return 0;
  return clamp((source.topAngle - angle) / span, -0.25, 1.25);
}

export function depthFromAngle(profile: ExerciseProfile, angle: number): number {
  return depthFrom(
    { angle: profile.primaryAngle, topAngle: profile.topAngle, bottomAngle: profile.bottomAngle },
    angle
  );
}

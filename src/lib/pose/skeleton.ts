// Skeleton overlay geometry.
//
// Turns detector keypoints into the lines and dots drawn over the camera
// preview. Pure TypeScript like the rest of this folder — the React component
// that draws it only maps these numbers to SVG.
//
// Why show it at all: the skeleton is the user's only evidence that tracking
// is working. Without it, a missed rep looks like a broken app; with it, the
// user can see the arm dropped out of frame and fix it themselves.

import type { Keypoint, LandmarkName, Landmarks } from './types';
import { isVisible } from './types';
import { OneEuroFilter } from './filter';
import type { ExerciseProfile } from './profiles';
import { jointsForAngle } from './profiles';

/** Body joints we draw. Eyes and ears are left out — they add clutter, not information. */
export const SKELETON_JOINTS: LandmarkName[] = [
  'nose',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
];

export const SKELETON_BONES: [LandmarkName, LandmarkName][] = [
  ['left_shoulder', 'right_shoulder'],
  ['left_hip', 'right_hip'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

/** Drawn joints must clear the same bar the pipeline uses for "seen". */
export const SKELETON_MIN_SCORE = 0.3;

/**
 * Base joint names ("knee", "elbow") the current exercise is measured on.
 * These are drawn highlighted so the user knows which part of them matters.
 */
export function focusJoints(profile: ExerciseProfile): Set<string> {
  const out = new Set<string>(profile.requiredJoints);
  for (const j of jointsForAngle(profile.primaryAngle)) out.add(j);
  if (profile.fallback) for (const j of jointsForAngle(profile.fallback.angle)) out.add(j);
  return out;
}

function baseName(name: LandmarkName): string {
  return name.replace(/^(left|right)_/, '');
}

/**
 * Visual smoothing for the drawn skeleton.
 *
 * Tuned looser than the rep detector's angle filter: positions are in
 * normalized frame units (a fast limb moves ~1 unit/s), and the overlay must
 * visibly keep up with the body or it reads as lag. Jitter while still is
 * what the filter is really for.
 *
 * A joint that goes unseen for longer than `dropAfterMs` is forgotten, so it
 * snaps rather than slides in from a stale position when it reappears.
 */
export class SkeletonSmoother {
  private readonly filters = new Map<LandmarkName, { x: OneEuroFilter; y: OneEuroFilter; lastSeen: number }>();

  private readonly dropAfterMs: number;

  constructor(dropAfterMs = 400) {
    this.dropAfterMs = dropAfterMs;
  }

  push(landmarks: Landmarks, t: number): Landmarks {
    const out: Landmarks = {};
    for (const name of SKELETON_JOINTS) {
      const kp = landmarks[name];
      let f = this.filters.get(name);

      if (!isVisible(kp, SKELETON_MIN_SCORE)) {
        if (f && t - f.lastSeen > this.dropAfterMs) this.filters.delete(name);
        continue;
      }

      if (!f) {
        f = {
          x: new OneEuroFilter({ minCutoff: 1.5, beta: 4, dCutoff: 1.0 }),
          y: new OneEuroFilter({ minCutoff: 1.5, beta: 4, dCutoff: 1.0 }),
          lastSeen: t,
        };
        this.filters.set(name, f);
      }
      f.lastSeen = t;
      out[name] = { x: f.x.filter(kp.x, t), y: f.y.filter(kp.y, t), score: kp.score };
    }
    return out;
  }

  reset(): void {
    this.filters.clear();
  }
}

export interface ViewTransform {
  /** Frame aspect ratio: landmark x spans 0..xMax, y spans 0..1. */
  xMax: number;
  viewWidth: number;
  viewHeight: number;
  /** Flip horizontally to match a mirrored (selfie) preview. */
  mirror: boolean;
}

export interface DrawnJoint {
  name: LandmarkName;
  x: number;
  y: number;
  score: number;
  focus: boolean;
}

export interface DrawnBone {
  key: string;
  x1: number; y1: number;
  x2: number; y2: number;
  focus: boolean;
}

export interface DrawnSkeleton {
  joints: DrawnJoint[];
  bones: DrawnBone[];
}

/**
 * Map a normalized landmark to preview pixels.
 *
 * The camera preview fills its view in "cover" mode: the frame is scaled up
 * until both axes cover the view, and the overflow is cropped equally from
 * both sides. The landmark has to go through exactly the same transform or the
 * skeleton drifts off the body toward the screen edges.
 */
export function toView(kp: Keypoint, t: ViewTransform): { x: number; y: number } {
  const xMax = t.xMax > 0 ? t.xMax : 1;
  const scale = Math.max(t.viewWidth / xMax, t.viewHeight);
  const offX = (t.viewWidth - xMax * scale) / 2;
  const offY = (t.viewHeight - scale) / 2;
  const nx = t.mirror ? xMax - kp.x : kp.x;
  return { x: nx * scale + offX, y: kp.y * scale + offY };
}

export function buildSkeleton(
  landmarks: Landmarks,
  transform: ViewTransform,
  focus: Set<string> = new Set()
): DrawnSkeleton {
  const pts = new Map<LandmarkName, DrawnJoint>();
  for (const name of SKELETON_JOINTS) {
    const kp = landmarks[name];
    if (!isVisible(kp, SKELETON_MIN_SCORE)) continue;
    const p = toView(kp, transform);
    pts.set(name, { name, x: p.x, y: p.y, score: kp.score, focus: focus.has(baseName(name)) });
  }

  const bones: DrawnBone[] = [];
  for (const [a, b] of SKELETON_BONES) {
    const pa = pts.get(a);
    const pb = pts.get(b);
    if (!pa || !pb) continue;
    bones.push({
      key: `${a}-${b}`,
      x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y,
      focus: pa.focus && pb.focus,
    });
  }

  return { joints: [...pts.values()], bones };
}

// Pure geometry helpers over normalized keypoints.

import type { Keypoint, Landmarks, LandmarkName, Side } from './types';
import { isVisible } from './types';

export interface Point { x: number; y: number }

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Interior angle in degrees at vertex `b` for the path a→b→c.
 * A fully straight limb is 180°; a fully folded one approaches 0°.
 */
export function angleAt(a: Point, b: Point, c: Point): number {
  const abx = a.x - b.x, aby = a.y - b.y;
  const cbx = c.x - b.x, cby = c.y - b.y;
  const magA = Math.hypot(abx, aby);
  const magC = Math.hypot(cbx, cby);
  if (magA === 0 || magC === 0) return 180;
  const cos = clamp((abx * cbx + aby * cby) / (magA * magC), -1, 1);
  return (Math.acos(cos) * 180) / Math.PI;
}

/**
 * Angle of the segment a→b away from vertical, in degrees (0 = perfectly
 * upright, 90 = horizontal). Sign-free — we only ever care about magnitude.
 */
export function angleFromVertical(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  return (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
}

/**
 * Perpendicular distance from point `p` to the infinite line through a and b.
 * Used for "is the hip sagging out of the plank line" style checks.
 */
export function distanceToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/**
 * Signed version of the above: positive when `p` sits on one side of a→b,
 * negative on the other. Lets us tell a sagging hip from a piked one.
 */
export function signedDistanceToLine(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return 0;
  return (dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

export function joint(lm: Landmarks, name: LandmarkName, minScore?: number): Keypoint | null {
  const kp = lm[name];
  return isVisible(kp, minScore) ? kp : null;
}

export function sided(side: Side, name: string): LandmarkName {
  return `${side}_${name}` as LandmarkName;
}

/**
 * Angle at a named joint on one side of the body, or null when any of the
 * three landmarks it needs is missing.
 */
export function jointAngle(
  lm: Landmarks,
  a: LandmarkName,
  b: LandmarkName,
  c: LandmarkName,
  minScore?: number
): number | null {
  const pa = joint(lm, a, minScore);
  const pb = joint(lm, b, minScore);
  const pc = joint(lm, c, minScore);
  if (!pa || !pb || !pc) return null;
  return angleAt(pa, pb, pc);
}

/**
 * Average of the same angle across both sides, falling back to whichever
 * single side is visible. This is what makes partial visibility survivable:
 * a phone propped close to you may only ever see one leg, and that is fine.
 */
export function bilateralAngle(
  lm: Landmarks,
  a: string,
  b: string,
  c: string,
  minScore?: number
): { value: number; sides: Side[] } | null {
  const values: number[] = [];
  const sides: Side[] = [];
  for (const side of ['left', 'right'] as Side[]) {
    const v = jointAngle(lm, sided(side, a), sided(side, b), sided(side, c), minScore);
    if (v !== null) {
      values.push(v);
      sides.push(side);
    }
  }
  if (values.length === 0) return null;
  return { value: values.reduce((s, v) => s + v, 0) / values.length, sides };
}

/** Bounding box over every landmark above `minScore`. */
export function boundingBox(lm: Landmarks, minScore?: number): {
  x0: number; y0: number; x1: number; y1: number;
  width: number; height: number; count: number;
} | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, count = 0;
  for (const kp of Object.values(lm)) {
    if (!isVisible(kp, minScore)) continue;
    count++;
    if (kp.x < x0) x0 = kp.x;
    if (kp.y < y0) y0 = kp.y;
    if (kp.x > x1) x1 = kp.x;
    if (kp.y > y1) y1 = kp.y;
  }
  if (count === 0) return null;
  return { x0, y0, x1, y1, width: x1 - x0, height: y1 - y0, count };
}

/** Mean detector confidence across the landmarks that were reported at all. */
export function meanScore(lm: Landmarks): number {
  const scores = Object.values(lm)
    .filter((kp): kp is Keypoint => !!kp)
    .map(kp => kp.score);
  if (scores.length === 0) return 0;
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

/**
 * Rough torso scale in normalized units — shoulder-to-hip distance. Every
 * threshold that should not depend on how far away the user is standing gets
 * divided by this, which is the other half of removing the fixed-distance
 * requirement.
 */
export function torsoScale(lm: Landmarks, minScore?: number): number | null {
  const ls = joint(lm, 'left_shoulder', minScore);
  const rs = joint(lm, 'right_shoulder', minScore);
  const lh = joint(lm, 'left_hip', minScore);
  const rh = joint(lm, 'right_hip', minScore);
  const shoulder = ls && rs ? midpoint(ls, rs) : (ls ?? rs);
  const hip = lh && rh ? midpoint(lh, rh) : (lh ?? rh);
  if (!shoulder || !hip) return null;
  const d = dist(shoulder, hip);
  return d > 1e-4 ? d : null;
}

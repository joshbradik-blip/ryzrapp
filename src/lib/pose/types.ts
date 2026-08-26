// Core pose types. Deliberately free of React Native imports so the whole
// detection pipeline can be unit-tested with plain node.
//
// Landmark names follow the MediaPipe BlazePose vocabulary, which is a
// superset of MoveNet's 17 COCO keypoints — whichever native detector we bind
// to, it can fill this shape.

export type LandmarkName =
  | 'nose'
  | 'left_eye' | 'right_eye'
  | 'left_ear' | 'right_ear'
  | 'left_shoulder' | 'right_shoulder'
  | 'left_elbow' | 'right_elbow'
  | 'left_wrist' | 'right_wrist'
  | 'left_hip' | 'right_hip'
  | 'left_knee' | 'right_knee'
  | 'left_ankle' | 'right_ankle'
  | 'left_heel' | 'right_heel'
  | 'left_foot_index' | 'right_foot_index';

export type Side = 'left' | 'right';

/**
 * A single detected joint.
 *
 * `x`/`y` are normalized to the frame: 0..1 with the origin at the top-left,
 * y increasing downward (image convention, not maths convention). Values
 * outside 0..1 are meaningful and are NOT clamped — a detector reporting
 * y = 1.14 for an ankle is telling us the feet are below the bottom edge,
 * which is exactly the signal the framing coach needs to say "step back".
 */
export interface Keypoint {
  x: number;
  y: number;
  /** Detector confidence, 0..1. */
  score: number;
}

export type Landmarks = Partial<Record<LandmarkName, Keypoint>>;

/** One detector output for one camera frame. */
export interface PoseFrame {
  /** Monotonic timestamp in milliseconds. */
  t: number;
  landmarks: Landmarks;
  /**
   * Mean scene luminance 0..1, when the detector or frame processor can
   * cheaply supply it. Used to distinguish "too dark to see you" from
   * "you're out of frame", which are very different fixes for the user.
   */
  brightness?: number;
}

/** Below this we treat a joint as not seen at all. */
export const MIN_KEYPOINT_SCORE = 0.3;

/** Joints we trust enough to drive rep counting off. */
export const GOOD_KEYPOINT_SCORE = 0.5;

export function isVisible(
  kp: Keypoint | undefined,
  minScore = MIN_KEYPOINT_SCORE
): kp is Keypoint {
  return !!kp && kp.score >= minScore;
}

/** True when the joint is both confidently detected and inside the frame. */
export function isInFrame(kp: Keypoint | undefined, minScore = MIN_KEYPOINT_SCORE): kp is Keypoint {
  return isVisible(kp, minScore) && kp.x >= 0 && kp.x <= 1 && kp.y >= 0 && kp.y <= 1;
}

// MoveNet SinglePose decoding and input preparation.
//
// Model: assets/models/movenet_lightning.tflite
//   input   1 x 192 x 192 x 3, float32, values in 0..255
//   output  1 x 1 x 17 x 3,    float32, [y, x, score] per keypoint, y/x in 0..1
//
// Pure TypeScript — no React Native, no TFLite imports — so the letterboxing
// and coordinate mapping below are unit-testable.

import type { Landmarks, LandmarkName } from './types';

/** MoveNet's 17 COCO keypoints, in output order. */
export const MOVENET_ORDER: LandmarkName[] = [
  'nose',
  'left_eye', 'right_eye',
  'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
];

export const MOVENET_INPUT_SIZE = 192;
export const MOVENET_KEYPOINTS = 17;
export const MOVENET_CHANNELS = 3;

/**
 * How the camera frame is fitted into the model's square input.
 *
 * We letterbox rather than squash or crop, and both alternatives are worse
 * in ways that matter here:
 *
 * - **Squashing** a 16:9 frame into a square distorts the person, and MoveNet
 *   is trained on aspect-preserved input, so keypoint accuracy drops.
 * - **Cropping** to a centre square is what vision-camera-resize-plugin does
 *   by default when no `crop` is given. It is undistorted, but it throws away
 *   the top and bottom of a portrait frame — exactly the field of view a
 *   squat needs, and exactly the "stand further back" problem this rebuild
 *   exists to remove.
 *
 * Letterboxing keeps the whole frame AND keeps the person undistorted; the
 * cost is a border of black pixels, which MoveNet handles fine.
 */
export interface LetterboxPlan {
  /** Resize the frame to these dimensions before padding. */
  width: number;
  height: number;
  /** Offset of the content inside the square, in pixels. */
  padX: number;
  padY: number;
  /** The square input size (both dimensions). */
  size: number;
}

export function planLetterbox(
  frameWidth: number,
  frameHeight: number,
  size = MOVENET_INPUT_SIZE
): LetterboxPlan {
  const safeW = frameWidth > 0 ? frameWidth : 1;
  const safeH = frameHeight > 0 ? frameHeight : 1;
  const scale = Math.min(size / safeW, size / safeH);
  // Round to whole pixels; the resizer cannot produce fractional sizes.
  const width = Math.max(1, Math.min(size, Math.round(safeW * scale)));
  const height = Math.max(1, Math.min(size, Math.round(safeH * scale)));
  return {
    width,
    height,
    padX: Math.floor((size - width) / 2),
    padY: Math.floor((size - height) / 2),
    size,
  };
}

/**
 * Copy a resized RGB uint8 buffer into the centre of a zero-padded float32
 * square, in the 0..255 range MoveNet expects.
 *
 * We ask the resizer for `uint8` rather than `float32` deliberately: uint8 is
 * unambiguously 0..255, whereas the plugin's float32 output is 0..1. Feeding
 * MoveNet a 0..1 tensor produces confident nonsense rather than an obvious
 * failure, so the ambiguity is worth removing at the source.
 *
 * `into` lets the caller reuse one buffer across frames — allocating 110k
 * floats per frame inside a frame processor is a GC problem.
 */
export function letterboxInto(
  pixels: ArrayLike<number>,
  plan: LetterboxPlan,
  into?: Float32Array
): Float32Array {
  const { width, height, padX, padY, size } = plan;
  const total = size * size * MOVENET_CHANNELS;
  const out = into && into.length === total ? into : new Float32Array(total);
  out.fill(0);

  const rowBytes = width * MOVENET_CHANNELS;
  for (let y = 0; y < height; y++) {
    const src = y * rowBytes;
    const dst = ((y + padY) * size + padX) * MOVENET_CHANNELS;
    for (let i = 0; i < rowBytes; i++) {
      out[dst + i] = pixels[src + i];
    }
  }
  return out;
}

export type FrameRotation = '0deg' | '90deg' | '180deg' | '270deg';

/**
 * Rotation needed to bring a frame upright, given its sensor orientation.
 *
 * VisionCamera delivers frames in the sensor's orientation, which on most
 * Android devices is landscape even when the phone is held portrait. If we
 * fed that to MoveNet unrotated the person would be lying on their side, and
 * every check that depends on which way is up — torso lean, hip sag, the
 * framing bounding box — would be wrong while the joint angles still looked
 * plausible. That is the worst kind of failure: confident and incorrect.
 *
 * The rotation is applied clockwise by vision-camera-resize-plugin.
 */
export function orientationToRotation(orientation: string | undefined): FrameRotation {
  switch (orientation) {
    case 'landscape-left': return '90deg';
    case 'portrait-upside-down': return '180deg';
    case 'landscape-right': return '270deg';
    case 'portrait':
    default:
      return '0deg';
  }
}

/** Frame dimensions after rotation — 90°/270° swap width and height. */
export function rotatedSize(
  width: number,
  height: number,
  rotation: FrameRotation
): { width: number; height: number } {
  return rotation === '90deg' || rotation === '270deg'
    ? { width: height, height: width }
    : { width, height };
}

export interface DecodeOptions {
  /** The letterbox plan the input was built with. */
  plan: LetterboxPlan;
  /**
   * Frame width / height.
   *
   * Landmarks come back with y in 0..1 and x in 0..aspect, so both axes are
   * on the same physical scale and joint angles are true. Reporting x in a
   * plain 0..1 alongside y would silently distort every angle in
   * formRules.ts — a 90° elbow on a 16:9 frame would read as about 62°.
   */
  aspect: number;
}

/**
 * Decode a MoveNet output tensor into landmarks in frame coordinates.
 *
 * The model reports positions inside the padded square, so we undo the
 * letterbox before returning: a keypoint on the padding maps outside 0..1,
 * which is exactly the "cropped out of frame" signal framing.ts looks for.
 *
 * Low-confidence keypoints are still returned — filtering belongs to
 * `isVisible`, which callers apply with their own thresholds.
 */
export function decodeMoveNet(output: ArrayLike<number>, opts: DecodeOptions): Landmarks {
  const lm: Landmarks = {};
  const { plan } = opts;
  const aspect = Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : 1;

  // Content region within the square, in 0..1 of the square.
  const contentX = plan.padX / plan.size;
  const contentY = plan.padY / plan.size;
  const contentW = plan.width / plan.size;
  const contentH = plan.height / plan.size;
  if (contentW <= 0 || contentH <= 0) return lm;

  const available = Math.min(MOVENET_KEYPOINTS, Math.floor(output.length / 3));
  for (let i = 0; i < available; i++) {
    const my = output[i * 3];
    const mx = output[i * 3 + 1];
    const score = output[i * 3 + 2];
    if (!Number.isFinite(mx) || !Number.isFinite(my)) continue;

    // Undo the padding, back into 0..1 across the real frame.
    const u = (mx - contentX) / contentW;
    const v = (my - contentY) / contentH;

    lm[MOVENET_ORDER[i]] = {
      x: u * aspect,
      y: v,
      score: Number.isFinite(score) ? score : 0,
    };
  }
  return lm;
}

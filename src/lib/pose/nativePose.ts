// Binding to an on-device pose-estimation frame-processor plugin.
//
// This is the only file in src/lib/pose that touches React Native. Everything
// else is pure TypeScript so the detection pipeline can be tested off-device.
//
// The binding is deliberately defensive: if the native plugin is not in the
// binary (Expo Go, an older build, a build made before the pose plugin was
// added), `loadPosePlugin()` returns null and the Form Coach falls back to
// the previous snapshot-based path instead of crashing on launch.

import type { Landmarks, LandmarkName, Keypoint } from './types';

/** Landmark order used by MediaPipe BlazePose (33 points). */
const BLAZEPOSE_ORDER: (LandmarkName | null)[] = [
  'nose',
  'left_eye', null, null,          // inner / outer eye variants we don't use
  'right_eye', null, null,
  'left_ear', 'right_ear',
  null, null,                      // mouth left / right
  'left_shoulder', 'right_shoulder',
  'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist',
  null, null, null, null, null, null, // pinky / index / thumb
  'left_hip', 'right_hip',
  'left_knee', 'right_knee',
  'left_ankle', 'right_ankle',
  'left_heel', 'right_heel',
  'left_foot_index', 'right_foot_index',
];

/** Landmark order used by MoveNet / PoseNet (17 COCO points). */
const MOVENET_ORDER: (LandmarkName | null)[] = [
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

interface RawPoint {
  x?: number; y?: number;
  score?: number; visibility?: number; confidence?: number; inFrameLikelihood?: number;
}

function toKeypoint(p: RawPoint): Keypoint | null {
  if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return null;
  const score = p.score ?? p.visibility ?? p.confidence ?? p.inFrameLikelihood ?? 1;
  return { x: p.x, y: p.y, score: typeof score === 'number' ? score : 1 };
}

/**
 * Normalize whatever shape the native plugin hands back into our Landmarks.
 *
 * Handles the three conventions in the wild: a keyed object, a 33-entry
 * BlazePose array, and a 17-entry MoveNet array. Unknown shapes yield an
 * empty result rather than throwing — a dropped frame is recoverable, a
 * crash inside a frame processor is not.
 */
export function normalizeLandmarks(raw: unknown): Landmarks {
  const out: Landmarks = {};
  if (!raw || typeof raw !== 'object') return out;

  // Keyed object: { left_knee: { x, y, score }, ... }
  if (!Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw as Record<string, RawPoint>)) {
      const name = key
        .replace(/([a-z])([A-Z])/g, '$1_$2')
        .toLowerCase() as LandmarkName;
      const kp = toKeypoint(value);
      if (kp) out[name] = kp;
    }
    return out;
  }

  const arr = raw as RawPoint[];
  const order = arr.length >= 33 ? BLAZEPOSE_ORDER : arr.length >= 17 ? MOVENET_ORDER : null;
  if (!order) return out;

  for (let i = 0; i < order.length && i < arr.length; i++) {
    const name = order[i];
    if (!name) continue;
    const kp = toKeypoint(arr[i]);
    if (kp) out[name] = kp;
  }
  return out;
}

export interface PosePluginHandle {
  /** Name the plugin registered itself under. */
  name: string;
  /** Call inside a frame processor worklet. */
  call: (frame: unknown) => unknown;
}

/**
 * Plugin names we know how to talk to, in preference order. Add to this list
 * rather than changing call sites when swapping detector libraries.
 */
const CANDIDATE_PLUGINS = ['poseLandmarks', 'poseDetection', 'pose'];

let cached: PosePluginHandle | null | undefined;

/**
 * Resolve the native pose plugin once. Returns null when no plugin is present
 * in this binary — callers must handle that and degrade, not assume.
 */
export function loadPosePlugin(): PosePluginHandle | null {
  if (cached !== undefined) return cached;
  cached = null;

  try {
    // Required lazily so that a build without VisionCamera frame processors
    // does not fail at import time.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { VisionCameraProxy } = require('react-native-vision-camera');
    if (!VisionCameraProxy?.initFrameProcessorPlugin) return cached;

    for (const name of CANDIDATE_PLUGINS) {
      try {
        const plugin = VisionCameraProxy.initFrameProcessorPlugin(name, {});
        if (plugin?.call) {
          cached = { name, call: (frame: unknown) => plugin.call(frame as never) };
          console.log(`[Pose] using native frame-processor plugin "${name}"`);
          return cached;
        }
      } catch {
        // Try the next candidate.
      }
    }
    console.log('[Pose] no native pose plugin found — falling back to snapshot mode');
  } catch (e) {
    console.log('[Pose] VisionCamera proxy unavailable:', (e as Error)?.message);
  }

  return cached;
}

export function isNativePoseAvailable(): boolean {
  return loadPosePlugin() !== null;
}

/** Test seam — lets unit tests reset the memoized lookup. */
export function __resetPosePluginCache(): void {
  cached = undefined;
}

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
  /**
   * The VisionCamera plugin object itself. Capture this in a frame processor
   * and call `plugin.call(frame, args)` there — it is a native host object,
   * so unlike a JS wrapper function it is callable from the worklet runtime.
   */
  plugin: { call: (frame: never, args?: Record<string, unknown>) => unknown };
}

/**
 * Plugin names we know how to talk to, in preference order. `ryzrPose` is
 * our own (modules/ryzr-pose: Apple Vision on iOS, ML Kit on Android). Add to
 * this list rather than changing call sites when swapping detector libraries.
 */
const CANDIDATE_PLUGINS = ['ryzrPose', 'poseLandmarks', 'poseDetection', 'pose'];

let cached: PosePluginHandle | null | undefined;

/**
 * Resolve the native pose plugin once. Returns null when no plugin is present
 * in this binary — callers must handle that and degrade, not assume.
 */
export function loadPosePlugin(): PosePluginHandle | null {
  if (cached !== undefined) return cached;
  cached = null;

  try {
    // On Android the ryzrPose plugin registers itself when its Expo module is
    // created; touching the module first guarantees that has happened. On iOS
    // it registers at load and there is no module, so this is a no-op.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('expo').requireOptionalNativeModule?.('RyzrPose');
  } catch {
    // Not fatal — the lookup below decides.
  }

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
          cached = { name, plugin };
          console.log(`[Pose] using native frame-processor plugin "${name}"`);
          return cached;
        }
      } catch {
        // Try the next candidate.
      }
    }
    console.log('[Pose] no native pose plugin in this build');
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

/** What the ryzrPose plugin returns: pixels in the upright image. */
export interface NativePoseResult {
  width: number;
  height: number;
  landmarks: Record<string, { x: number; y: number; score: number }>;
}

/**
 * Convert a ryzrPose result into the pipeline's coordinate space: y in 0..1
 * of the upright frame height, x in 0..xMax where xMax is the aspect ratio,
 * so both axes share one scale and joint angles are true.
 *
 * Returns null for anything malformed, so the caller can count it as a miss.
 * Runs on the frame-processor runtime, hence the 'worklet' directive.
 */
export function nativePoseToFrame(
  raw: unknown
): { landmarks: Landmarks; xMax: number } | null {
  'worklet';
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<NativePoseResult>;
  const width = Number(r.width);
  const height = Number(r.height);
  if (!(width > 0) || !(height > 0) || !r.landmarks || typeof r.landmarks !== 'object') return null;

  const out: Landmarks = {};
  const names = Object.keys(r.landmarks);
  for (let i = 0; i < names.length; i++) {
    const p = r.landmarks[names[i]];
    if (!p) continue;
    const x = Number(p.x);
    const y = Number(p.y);
    const score = Number(p.score);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out[names[i] as LandmarkName] = {
      x: x / height,
      y: y / height,
      score: Number.isFinite(score) ? score : 0,
    };
  }
  return { landmarks: out, xMax: width / height };
}

/** '90deg' → 90. The native plugin takes plain clockwise degrees. */
export function rotationDegrees(rotation: string): number {
  'worklet';
  const n = parseInt(rotation, 10);
  return Number.isFinite(n) ? n : 0;
}

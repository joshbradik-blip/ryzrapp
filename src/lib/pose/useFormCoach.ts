// React binding between the camera and the pose pipeline.
//
// Kept separate from the pure modules in this folder so those stay testable
// without React Native. Nothing here makes decisions — it moves frames in and
// state out.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import type { FramingResult, RepPhase, SessionSummary } from './index';
import { FormCoachSession } from './session';
import { normalizeLandmarks } from './nativePose';
import { useTflitePose } from './tflitePose';
import {
  MOVENET_INPUT_SIZE,
  decodeMoveNet,
  letterboxInto,
  orientationToRotation,
  planLetterbox,
  rotatedSize,
} from './movenet';

/**
 * Target detector rate.
 *
 * Rep phases last hundreds of milliseconds, so 15fps resolves them with room
 * to spare, and halving the inference count meaningfully cuts battery and
 * heat over a full workout. Higher rates buy nothing the rep detector can use.
 */
const TARGET_FPS = 15;
const MIN_FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

export interface CoachState {
  reps: number;
  score: number | null;
  phase: RepPhase;
  /** 0 (top) → 1 (bottom) of the current rep. */
  depth: number;
  framing: FramingResult | null;
  /** Most recent cue to show/speak, with a nonce so repeats still fire. */
  cue: { text: string; id: number } | null;
  /** Detector frames processed in the last second. */
  fps: number;
}

const IDLE_STATE: CoachState = {
  reps: 0,
  score: null,
  phase: 'idle',
  depth: 0,
  framing: null,
  cue: null,
  fps: 0,
};

export interface UseFormCoachOptions {
  exerciseName: string;
  active: boolean;
  /** Called once per completed rep, on the JS thread. */
  onRep?: (index: number, score: number) => void;
  /** Called when a cue should be spoken. */
  onCue?: (text: string) => void;
}

export function useFormCoach({ exerciseName, active, onRep, onCue }: UseFormCoachOptions) {
  const pose = useTflitePose(active);
  const sessionRef = useRef<FormCoachSession | null>(null);
  const [state, setState] = useState<CoachState>(IDLE_STATE);

  // Keep callbacks in refs so the frame handler identity stays stable — a
  // changing frame processor tears down and rebuilds the camera pipeline.
  const onRepRef = useRef(onRep);
  const onCueRef = useRef(onCue);
  onRepRef.current = onRep;
  onCueRef.current = onCue;

  const cueIdRef = useRef(0);
  const fpsWindow = useRef<number[]>([]);

  if (sessionRef.current === null || sessionRef.current.exerciseName !== exerciseName) {
    sessionRef.current = new FormCoachSession(exerciseName);
  }
  const session = sessionRef.current;

  const reset = useCallback(() => {
    sessionRef.current?.reset();
    fpsWindow.current = [];
    setState(IDLE_STATE);
  }, []);

  /**
   * Entry point from the worklet — runs on the JS thread.
   *
   * Takes an already-decoded keypoint array rather than a Frame, because a
   * Frame is only valid for the lifetime of the frame processor call.
   */
  const handlePose = useCallback((
    raw: unknown,
    timestamp: number,
    xMax: number,
    brightness?: number
  ) => {
    const s = sessionRef.current;
    if (!s) return;

    const landmarks = normalizeLandmarks(raw);
    const tick = s.push({ t: timestamp, landmarks, xMax, brightness });

    const w = fpsWindow.current;
    w.push(timestamp);
    while (w.length > 0 && timestamp - w[0] > 1000) w.shift();

    let cue: CoachState['cue'] = null;
    if (tick.cue) {
      cueIdRef.current += 1;
      cue = { text: tick.cue, id: cueIdRef.current };
      onCueRef.current?.(tick.cue);
    }

    if (tick.rep) {
      onRepRef.current?.(tick.rep.index, tick.rep.analysis.score);
    }

    setState(prev => ({
      reps: tick.reps,
      score: tick.score,
      phase: tick.phase,
      depth: tick.depth,
      framing: tick.framing,
      cue: cue ?? prev.cue,
      fps: w.length,
    }));
  }, []);

  // Bridge worklet → JS. Built defensively: a build without worklets must
  // degrade to snapshot mode, not crash on mount.
  const runOnJs = useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Worklets } = require('react-native-worklets-core');
      return Worklets?.createRunOnJS ? Worklets.createRunOnJS(handlePose) : null;
    } catch {
      return null;
    }
  }, [handlePose]);

  const model = pose.model;
  const resize = pose.resize;
  const ready = active && pose.status === 'ready' && model !== null && resize !== null && runOnJs !== null;

  // Shared across frames so we are not allocating a 110k-element tensor at
  // 15fps. Worklets see the same object each call.
  const scratch = useMemo(() => ({ input: null as Float32Array | null, lastAt: 0 }), []);

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (!ready || !model || !resize || !runOnJs) return;

      try {
        // Throttle: VisionCamera delivers at the camera's rate, which is more
        // than the rep detector can use and costs battery.
        const rawTs = (frame as unknown as { timestamp?: number }).timestamp ?? 0;
        // `timestamp` is nanoseconds on some platforms, milliseconds on others.
        const nowMs = rawTs > 1e12 ? rawTs / 1e6 : rawTs;
        if (nowMs - scratch.lastAt < MIN_FRAME_INTERVAL_MS) return;
        scratch.lastAt = nowMs;

        const f = frame as unknown as {
          width: number;
          height: number;
          orientation?: string;
        };

        // Bring the frame upright before anything measures it.
        const rotation = orientationToRotation(f.orientation);
        const upright = rotatedSize(f.width, f.height, rotation);
        const plan = planLetterbox(upright.width, upright.height, MOVENET_INPUT_SIZE);

        // Explicit full-frame crop: without it the plugin centre-crops to a
        // square and silently throws away the top and bottom of the frame.
        // The crop is in the frame's own (unrotated) coordinates.
        const pixels = resize(frame, {
          crop: { x: 0, y: 0, width: f.width, height: f.height },
          scale: { width: plan.width, height: plan.height },
          rotation,
          pixelFormat: 'rgb',
          dataType: 'uint8',
        });

        scratch.input = letterboxInto(pixels, plan, scratch.input ?? undefined);

        const outputs = model.runSync([scratch.input.buffer]);
        const out = outputs?.[0] as ArrayLike<number> | undefined;
        if (!out) return;

        const aspect = upright.height > 0 ? upright.width / upright.height : 1;
        const landmarks = decodeMoveNet(out, { plan, aspect });
        runOnJs(landmarks, nowMs, aspect, undefined);
      } catch {
        // Never throw inside a frame processor — it takes down the camera.
      }
    },
    [ready, model, resize, runOnJs, scratch]
  );

  useEffect(() => {
    if (!active) reset();
  }, [active, reset]);

  const summary = useCallback((): SessionSummary | null => {
    return sessionRef.current?.summary() ?? null;
  }, []);

  const adjustReps = useCallback((delta: number) => {
    const next = sessionRef.current?.adjustReps(delta) ?? 0;
    setState(prev => ({ ...prev, reps: next }));
    return next;
  }, []);

  return {
    /** True when on-device pose tracking is actually running. */
    poseAvailable: ready,
    /** 'ready' | 'loading' | 'unavailable' | 'error' — drives the mode notice. */
    poseStatus: pose.status,
    poseDetail: pose.detail,
    profile: session.profile,
    frameProcessor: ready ? frameProcessor : undefined,
    state,
    reset,
    summary,
    adjustReps,
  };
}

// React binding between the camera and the pose pipeline.
//
// Kept separate from the pure modules in this folder so those stay testable
// without React Native. Nothing here makes decisions — it moves frames in and
// state out.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import type { FramingResult, RepPhase, SessionSummary } from './index';
import { FormCoachSession } from './session';
import { loadPosePlugin, normalizeLandmarks } from './nativePose';

export interface CoachState {
  reps: number;
  score: number | null;
  phase: RepPhase;
  /** 0 (top) → 1 (bottom) of the current rep. */
  depth: number;
  framing: FramingResult | null;
  /** Most recent cue to show/speak, with a nonce so repeats still fire. */
  cue: { text: string; id: number } | null;
  /** Frames per second the detector is actually seeing. */
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
  const plugin = useMemo(() => loadPosePlugin(), []);
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

  /** Entry point from the worklet — runs on the JS thread. */
  const handlePose = useCallback((raw: unknown, timestamp: number, brightness?: number) => {
    const session = sessionRef.current;
    if (!session) return;

    const landmarks = normalizeLandmarks(raw);
    const tick = session.push({ t: timestamp, landmarks, brightness });

    // Rolling FPS over the last second of frames.
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

  // Bridge worklet → JS. Built lazily and defensively: a build without
  // worklets must degrade to snapshot mode, not crash on mount.
  const runOnJs = useMemo(() => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Worklets } = require('react-native-worklets-core');
      return Worklets?.createRunOnJS ? Worklets.createRunOnJS(handlePose) : null;
    } catch {
      return null;
    }
  }, [handlePose]);

  const enabled = active && plugin !== null && runOnJs !== null;

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      if (!enabled || !plugin || !runOnJs) return;
      try {
        const result = plugin.call(frame);
        if (result) {
          // `frame.timestamp` is nanoseconds on some platforms and already
          // milliseconds on others; normalize to ms.
          const raw = (frame as unknown as { timestamp?: number }).timestamp ?? 0;
          const ms = raw > 1e12 ? raw / 1e6 : raw;
          runOnJs(result, ms);
        }
      } catch {
        // Never throw inside a frame processor — it takes down the camera.
      }
    },
    [enabled, plugin, runOnJs]
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
    poseAvailable: plugin !== null && runOnJs !== null,
    profile: session.profile,
    frameProcessor: enabled ? frameProcessor : undefined,
    state,
    reset,
    summary,
    adjustReps,
  };
}

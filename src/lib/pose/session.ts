// Form Coach session orchestrator.
//
// The screen feeds this pose frames and renders what comes back. All of the
// state machinery — framing checks, smoothing, rep detection, form rules,
// cue throttling — lives here so it can be tested without a camera.

import type { PoseFrame } from './types';
import type { ExerciseProfile } from './profiles';
import { profileFor } from './profiles';
import type { RepEvent, RepPhase } from './repDetector';
import { RepDetector } from './repDetector';
import type { FramingResult } from './framing';
import { analyzeFraming, inferredView } from './framing';
import type { Finding, RepAnalysis } from './formRules';
import { analyzeRep } from './formRules';
import { Debouncer } from './filter';

export interface SessionTick {
  framing: FramingResult;
  phase: RepPhase;
  depth: number;
  reps: number;
  /** Rolling form score, 0..100. Null until the first rep lands. */
  score: number | null;
  /** Set when this frame completed a rep. */
  rep: (RepEvent & { analysis: RepAnalysis }) | null;
  /** A cue that should be shown/spoken right now, if any. */
  cue: string | null;
}

export interface SessionSummary {
  exerciseName: string;
  profileId: string;
  reps: number;
  averageScore: number;
  /** Distinct cues, most frequent first. */
  topIssues: { cue: string; count: number }[];
  averageRepMs: number;
  averageEccentricMs: number;
  averagePeakDepth: number;
  /** Mean tracking quality — surfaced so a low-confidence set says so. */
  trackingQuality: number;
  /** Every rep's score, in order, for the sparkline. */
  repScores: number[];
}

export interface SessionOptions {
  /** Minimum gap between two spoken/shown cues, ms. */
  cueIntervalMs?: number;
  /** Minimum gap before repeating the SAME cue, ms. */
  sameCueIntervalMs?: number;
  /** Minimum gap between framing nags, ms. */
  framingIntervalMs?: number;
}

const DEFAULTS = {
  cueIntervalMs: 4_000,
  sameCueIntervalMs: 15_000,
  framingIntervalMs: 6_000,
};

export class FormCoachSession {
  readonly exerciseName: string;
  readonly profile: ExerciseProfile;
  private readonly detector: RepDetector;
  private readonly trackable = new Debouncer(5, 0.6);
  private readonly opts: Required<SessionOptions>;

  private lastPhase: RepPhase = 'idle';
  private topFrame: PoseFrame | null = null;
  private bottomFrame: PoseFrame | null = null;
  private bestDepth = -Infinity;

  private repScores: number[] = [];
  private repEvents: RepEvent[] = [];
  private issueCounts = new Map<string, number>();
  private qualitySum = 0;
  private qualityCount = 0;

  private lastCue: string | null = null;
  private lastCueAt = 0;
  private lastFramingAt = 0;
  private lastFramingCode: string | null = null;

  constructor(exerciseName: string, opts: SessionOptions = {}) {
    this.exerciseName = exerciseName;
    this.profile = profileFor(exerciseName);
    this.detector = new RepDetector(this.profile);
    this.opts = { ...DEFAULTS, ...opts };
  }

  get reps(): number {
    return this.detector.reps;
  }

  get isHold(): boolean {
    return this.profile.isHold === true;
  }

  push(frame: PoseFrame): SessionTick {
    const framing = analyzeFraming(frame, this.profile);
    this.trackable.push(framing.trackable);
    this.qualitySum += framing.quality;
    this.qualityCount++;

    // Framing problems are surfaced on their own throttle so they cannot
    // drown out form cues, and cannot repeat every frame.
    let cue: string | null = null;
    if (framing.severity !== 'ok' && this.shouldNagFraming(frame.t, framing.code)) {
      cue = framing.message;
      this.lastFramingAt = frame.t;
      this.lastFramingCode = framing.code;
    }

    // Do not feed the detector frames we do not trust — better to miss a rep
    // than to invent one. The manual +Rep button covers the gap.
    if (!framing.trackable) {
      return {
        framing,
        phase: this.detector.currentPhase,
        depth: 0,
        reps: this.detector.reps,
        score: this.rollingScore(),
        rep: null,
        cue,
      };
    }

    const tick = this.detector.push(frame, framing.quality);

    // Capture the frames the form rules need: the top of the rep and its
    // deepest point.
    if (this.lastPhase === 'idle' && tick.phase === 'descending') {
      this.topFrame = frame;
      this.bottomFrame = frame;
      this.bestDepth = tick.depth;
    } else if (tick.phase !== 'idle' && tick.depth > this.bestDepth) {
      this.bestDepth = tick.depth;
      this.bottomFrame = frame;
    }
    this.lastPhase = tick.phase;

    let repOut: (RepEvent & { analysis: RepAnalysis }) | null = null;

    if (tick.rep) {
      const analysis = analyzeRep({
        profile: this.profile,
        event: tick.rep,
        bottomFrame: this.bottomFrame,
        topFrame: this.topFrame,
      });

      this.repScores.push(analysis.score);
      this.repEvents.push(tick.rep);
      for (const f of analysis.findings) {
        this.issueCounts.set(f.cue, (this.issueCounts.get(f.cue) ?? 0) + 1);
      }

      repOut = { ...tick.rep, analysis };

      // A real form cue outranks a framing nag on the same frame.
      if (analysis.topCue && this.shouldSpeak(analysis.topCue, frame.t)) {
        cue = analysis.topCue;
        this.lastCue = analysis.topCue;
        this.lastCueAt = frame.t;
      }

      this.bestDepth = -Infinity;
      this.bottomFrame = null;
      this.topFrame = null;
    }

    return {
      framing,
      phase: tick.phase,
      depth: tick.depth,
      reps: this.detector.reps,
      score: this.rollingScore(),
      rep: repOut,
      cue,
    };
  }

  private shouldSpeak(cue: string, t: number): boolean {
    const since = t - this.lastCueAt;
    if (since < this.opts.cueIntervalMs) return false;
    if (cue === this.lastCue && since < this.opts.sameCueIntervalMs) return false;
    return true;
  }

  private shouldNagFraming(t: number, code: string): boolean {
    // A *changed* problem is worth saying immediately; the same one repeats
    // on a slow throttle.
    if (code !== this.lastFramingCode) return true;
    return t - this.lastFramingAt >= this.opts.framingIntervalMs;
  }

  private rollingScore(): number | null {
    if (this.repScores.length === 0) return null;
    const recent = this.repScores.slice(-5);
    return Math.round(recent.reduce((s, v) => s + v, 0) / recent.length);
  }

  /** Manual rep adjustment from the UI. */
  adjustReps(delta: number): number {
    const next = Math.max(0, this.detector.reps + delta);
    this.detector.setCount(next);
    if (delta > 0) {
      // A manually added rep has no measured form; do not let it drag the
      // average in either direction.
      this.repScores.push(this.rollingScore() ?? 75);
    } else if (delta < 0) {
      this.repScores.pop();
      this.repEvents.pop();
    }
    return next;
  }

  summary(): SessionSummary {
    const n = this.repScores.length;
    const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

    const topIssues = [...this.issueCounts.entries()]
      .map(([cue, count]) => ({ cue, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

    return {
      exerciseName: this.exerciseName,
      profileId: this.profile.id,
      reps: this.detector.reps,
      averageScore: n > 0 ? Math.round(avg(this.repScores)) : 0,
      topIssues,
      averageRepMs: Math.round(avg(this.repEvents.map(r => r.durationMs))),
      averageEccentricMs: Math.round(avg(this.repEvents.map(r => r.eccentricMs))),
      averagePeakDepth: Number(avg(this.repEvents.map(r => r.peakDepth)).toFixed(2)),
      trackingQuality: this.qualityCount > 0
        ? Number((this.qualitySum / this.qualityCount).toFixed(2))
        : 0,
      repScores: [...this.repScores],
    };
  }

  reset(): void {
    this.detector.reset();
    this.trackable.reset();
    this.repScores = [];
    this.repEvents = [];
    this.issueCounts.clear();
    this.qualitySum = 0;
    this.qualityCount = 0;
    this.lastPhase = 'idle';
    this.topFrame = null;
    this.bottomFrame = null;
    this.bestDepth = -Infinity;
    this.lastCue = null;
    this.lastCueAt = 0;
    this.lastFramingAt = 0;
    this.lastFramingCode = null;
  }
}

export { inferredView };
export type { Finding, FramingResult, RepEvent, RepPhase, RepAnalysis };

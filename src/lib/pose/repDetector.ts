// Rep counting from a smoothed joint angle.
//
// Replaces the old approach of asking a vision model to classify each still
// frame as ready/mid/contracted and counting transitions. That was fragile
// for reasons no amount of prompting fixes: a single frame has no velocity,
// the model was sampled once every two seconds (fast enough to miss a rep
// entirely), and one misclassification silently added or dropped a count.
//
// Here a rep is a trajectory, not a snapshot: descend past the bottom
// threshold, come back above the top threshold, having covered enough range
// of motion, in a plausible amount of time.

import { OneEuroFilter } from './filter';
import type { AngleSource, ExerciseProfile } from './profiles';
import { depthFrom, measureAngle, resolveAngleSource } from './profiles';
import type { PoseFrame } from './types';

export type RepPhase = 'idle' | 'descending' | 'bottom' | 'ascending';

/**
 * Depth at which we consider the user to have reached the bottom.
 *
 * Deliberately permissive. A quarter squat is still a rep the user performed
 * and expects to see counted — it is the form SCORE's job to tell them it was
 * shallow, not the counter's job to pretend it never happened. Refusing to
 * count anything short of textbook depth was a large part of why the old
 * coach felt broken.
 */
const BOTTOM_ENTER = 0.6;
/** Depth we must come back above for the rep to close. Hysteresis gap
 *  prevents a hovering user from ratcheting up counts. */
const TOP_ENTER = 0.28;

/** Reps faster than this are almost always tracking noise, not movement. */
const MIN_REP_MS = 450;
/** Reps slower than this are a paused set, not a rep — reset instead. */
const MAX_REP_MS = 20_000;

export interface RepEvent {
  index: number;
  /** Milliseconds from leaving the top to returning to it. */
  durationMs: number;
  /** Deepest normalized depth reached, 0..1+. */
  peakDepth: number;
  /** Time spent descending vs. ascending, in ms. */
  eccentricMs: number;
  concentricMs: number;
  /** Angle samples over the rep, for downstream form analysis. */
  minAngle: number;
  maxAngle: number;
  /** Mean tracking quality across the rep, 0..1. */
  quality: number;
  /**
   * Which angle these numbers were measured on. Form rules that compare raw
   * degrees must read the thresholds off this, not off the profile — the
   * fallback source has a completely different scale.
   */
  source: AngleSource;
}

export interface RepTick {
  /** Smoothed primary angle in degrees, or null when unmeasurable. */
  angle: number | null;
  /** Normalized 0 (top) → 1 (bottom). */
  depth: number;
  phase: RepPhase;
  /** Emitted on the frame a rep completes. */
  rep: RepEvent | null;
  /** Angular velocity, degrees/sec (smoothed). */
  velocity: number;
}

export interface RepDetectorOptions {
  bottomEnter?: number;
  topEnter?: number;
  minRepMs?: number;
  maxRepMs?: number;
}

export class RepDetector {
  private readonly profile: ExerciseProfile;
  private readonly filter: OneEuroFilter;
  private readonly bottomEnter: number;
  private readonly topEnter: number;
  private readonly minRepMs: number;
  private readonly maxRepMs: number;

  private phase: RepPhase = 'idle';
  /**
   * Latched once the first measurable frame arrives. Held for the rest of the
   * set: swapping between the knee and hip angle mid-rep would step the depth
   * signal and invent a rep boundary out of nothing.
   */
  private source: AngleSource | null = null;
  private count = 0;
  private repStartedAt: number | null = null;
  private bottomAt: number | null = null;
  /** Timestamp of the deepest point so far — the true eccentric/concentric split. */
  private peakAt: number | null = null;
  private peakDepth = 0;
  private minAngle = Infinity;
  private maxAngle = -Infinity;
  private qualitySum = 0;
  private qualityCount = 0;

  constructor(profile: ExerciseProfile, opts: RepDetectorOptions = {}) {
    this.profile = profile;
    this.bottomEnter = opts.bottomEnter ?? BOTTOM_ENTER;
    this.topEnter = opts.topEnter ?? TOP_ENTER;
    this.minRepMs = opts.minRepMs ?? MIN_REP_MS;
    this.maxRepMs = opts.maxRepMs ?? MAX_REP_MS;
    // Joint angles are slow, large-amplitude signals; smooth them hard when
    // static and let beta open the cutoff up during the actual movement.
    this.filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.04, dCutoff: 1.0 });
  }

  get reps(): number {
    return this.count;
  }

  get currentPhase(): RepPhase {
    return this.phase;
  }

  /** The angle actually being measured, once latched. */
  get activeSource(): AngleSource | null {
    return this.source;
  }

  /**
   * Feed one detected frame.
   * @param quality tracking confidence for this frame, 0..1
   */
  push(frame: PoseFrame, quality = 1): RepTick {
    // Once latched, keep measuring the same angle even if a richer one becomes
    // available — consistency matters more than precision inside a set.
    const measured = this.source
      ? measureOn(frame, this.source)
      : resolveAngleSource(frame.landmarks, this.profile);

    if (measured === null) {
      // Lost the joints. Do not guess and do not count — but hold the phase
      // so a brief occlusion mid-rep does not drop the rep on reacquisition.
      return { angle: null, depth: 0, phase: this.phase, rep: null, velocity: 0 };
    }
    this.source = measured.source;

    const angle = this.filter.filter(measured.value, frame.t);
    const depth = depthFrom(this.source, angle);
    const velocity = this.filter.velocity;

    this.qualitySum += quality;
    this.qualityCount++;

    let rep: RepEvent | null = null;

    switch (this.phase) {
      case 'idle':
        if (depth > this.topEnter) {
          this.beginRep(frame.t, angle);
          this.phase = 'descending';
        }
        break;

      case 'descending':
        this.track(angle, depth, frame.t);
        if (depth >= this.bottomEnter) {
          this.bottomAt = frame.t;
          this.phase = 'bottom';
        } else if (depth <= this.topEnter) {
          // Came back up without ever reaching the bottom — a bounce, a
          // re-grip, or noise. Abandon quietly rather than counting it.
          this.resetRep();
        } else if (this.expired(frame.t)) {
          this.resetRep();
        }
        break;

      case 'bottom':
        this.track(angle, depth, frame.t);
        if (depth < this.bottomEnter) this.phase = 'ascending';
        else if (this.expired(frame.t)) this.resetRep();
        break;

      case 'ascending':
        this.track(angle, depth, frame.t);
        if (depth <= this.topEnter) {
          rep = this.closeRep(frame.t);
          this.phase = 'idle';
        } else if (depth >= this.bottomEnter) {
          // Sank back down — treat it as still the same rep.
          this.phase = 'bottom';
          this.bottomAt = frame.t;
        } else if (this.expired(frame.t)) {
          this.resetRep();
        }
        break;
    }

    return { angle, depth, phase: this.phase, rep, velocity };
  }

  private beginRep(t: number, angle: number): void {
    this.repStartedAt = t;
    this.bottomAt = null;
    this.peakAt = t;
    this.peakDepth = 0;
    this.minAngle = angle;
    this.maxAngle = angle;
    this.qualitySum = 0;
    this.qualityCount = 0;
  }

  private track(angle: number, depth: number, t: number): void {
    if (depth > this.peakDepth) {
      this.peakDepth = depth;
      this.peakAt = t;
    }
    if (angle < this.minAngle) this.minAngle = angle;
    if (angle > this.maxAngle) this.maxAngle = angle;
  }

  private expired(t: number): boolean {
    return this.repStartedAt !== null && t - this.repStartedAt > this.maxRepMs;
  }

  private resetRep(): void {
    this.phase = 'idle';
    this.repStartedAt = null;
    this.bottomAt = null;
    this.peakAt = null;
    this.peakDepth = 0;
    this.minAngle = Infinity;
    this.maxAngle = -Infinity;
  }

  private closeRep(t: number): RepEvent | null {
    const startedAt = this.repStartedAt;
    // Split the rep at its deepest point. Splitting at the moment the user
    // ENTERED the bottom zone charges the whole pause at the bottom to the
    // concentric, which made every tempo reading wrong.
    const turnAt = this.peakAt ?? this.bottomAt;
    const durationMs = startedAt === null ? 0 : t - startedAt;

    // Range-of-motion gate: a twitch that technically crossed both thresholds
    // but covered almost none of the movement is not a rep.
    const romOk = this.peakDepth >= this.profile.minRom;
    const timeOk = durationMs >= this.minRepMs && durationMs <= this.maxRepMs;

    if (!romOk || !timeOk || startedAt === null) {
      this.resetRep();
      return null;
    }

    this.count++;
    const event: RepEvent = {
      index: this.count,
      durationMs,
      peakDepth: this.peakDepth,
      eccentricMs: turnAt === null ? durationMs / 2 : turnAt - startedAt,
      concentricMs: turnAt === null ? durationMs / 2 : t - turnAt,
      minAngle: this.minAngle,
      maxAngle: this.maxAngle,
      quality: this.qualityCount > 0 ? this.qualitySum / this.qualityCount : 0,
      source: this.source ?? {
        angle: this.profile.primaryAngle,
        topAngle: this.profile.topAngle,
        bottomAngle: this.profile.bottomAngle,
      },
    };
    this.resetRep();
    return event;
  }

  /** Manual correction from the UI — keeps the machine and the count in sync. */
  setCount(n: number): void {
    this.count = Math.max(0, Math.floor(n));
  }

  reset(): void {
    this.filter.reset();
    this.resetRep();
    this.source = null;
    this.count = 0;
    this.qualitySum = 0;
    this.qualityCount = 0;
  }
}

/** Measure one specific source on a frame, keeping the source with the value. */
function measureOn(
  frame: PoseFrame,
  source: AngleSource
): { source: AngleSource; value: number } | null {
  const measured = measureAngle(frame.landmarks, source.angle);
  return measured ? { source, value: measured.value } : null;
}

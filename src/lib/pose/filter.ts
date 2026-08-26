// One Euro filter — adaptive low-pass smoothing for noisy signals.
//
// Casiez, Roussel & Vogel (CHI 2012). The property we care about: it filters
// hard when the signal is slow (killing the jitter that poor lighting causes
// in keypoint estimates) and barely at all when the signal is moving fast
// (so it does not add lag to the bottom of a rep, which would shift rep
// timing and wreck tempo feedback).
//
// This is the single biggest reason a keypoint pipeline tolerates bad
// conditions where per-frame classification does not: noise gets averaged
// away instead of being read as movement.

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

class LowPass {
  private y: number | null = null;

  filter(x: number, a: number): number {
    this.y = this.y === null ? x : a * x + (1 - a) * this.y;
    return this.y;
  }

  get value(): number | null {
    return this.y;
  }

  reset(): void {
    this.y = null;
  }
}

export interface OneEuroOptions {
  /** Baseline cutoff in Hz. Lower = smoother but laggier when still. */
  minCutoff?: number;
  /** How aggressively the cutoff opens up with speed. Higher = less lag. */
  beta?: number;
  /** Cutoff for the derivative estimate itself. */
  dCutoff?: number;
}

export class OneEuroFilter {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;
  private readonly xf = new LowPass();
  private readonly dxf = new LowPass();
  private lastTime: number | null = null;

  constructor(opts: OneEuroOptions = {}) {
    this.minCutoff = opts.minCutoff ?? 1.2;
    this.beta = opts.beta ?? 0.05;
    this.dCutoff = opts.dCutoff ?? 1.0;
  }

  /** @param t timestamp in milliseconds */
  filter(x: number, t: number): number {
    if (!Number.isFinite(x)) return this.xf.value ?? 0;

    let dt = this.lastTime === null ? 1 / 30 : (t - this.lastTime) / 1000;
    // Guard against duplicate or out-of-order timestamps from the camera.
    if (!Number.isFinite(dt) || dt <= 0) dt = 1 / 30;
    this.lastTime = t;

    const prev = this.xf.value;
    const dx = prev === null ? 0 : (x - prev) / dt;
    const dxHat = this.dxf.filter(dx, alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    return this.xf.filter(x, alpha(cutoff, dt));
  }

  /** Filtered rate of change, in units per second. */
  get velocity(): number {
    return this.dxf.value ?? 0;
  }

  get value(): number | null {
    return this.xf.value;
  }

  reset(): void {
    this.xf.reset();
    this.dxf.reset();
    this.lastTime = null;
  }
}

/**
 * Majority vote over a sliding window of booleans. Used so a single bad frame
 * never flips a user-visible state (a framing warning, a form fault). Nothing
 * in the UI should react to one frame.
 */
export class Debouncer {
  private readonly window: boolean[] = [];
  private readonly size: number;
  private readonly threshold: number;

  constructor(size = 5, threshold = 0.6) {
    this.size = size;
    this.threshold = threshold;
  }

  push(v: boolean): boolean {
    this.window.push(v);
    if (this.window.length > this.size) this.window.shift();
    return this.value;
  }

  get value(): boolean {
    if (this.window.length === 0) return false;
    const hits = this.window.filter(Boolean).length;
    return hits / this.window.length >= this.threshold;
  }

  /** True once enough frames have accumulated to trust `value`. */
  get settled(): boolean {
    return this.window.length >= Math.min(this.size, 3);
  }

  reset(): void {
    this.window.length = 0;
  }
}

export interface Keypoint {
  y: number; // normalized 0–1, origin top-left
  x: number;
  score: number;
}

// MoveNet SinglePose Lightning keypoint indices
export const KP = {
  NOSE: 0,
  LEFT_EYE: 1, RIGHT_EYE: 2,
  LEFT_EAR: 3, RIGHT_EAR: 4,
  LEFT_SHOULDER: 5, RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7, RIGHT_ELBOW: 8,
  LEFT_WRIST: 9, RIGHT_WRIST: 10,
  LEFT_HIP: 11, RIGHT_HIP: 12,
  LEFT_KNEE: 13, RIGHT_KNEE: 14,
  LEFT_ANKLE: 15, RIGHT_ANKLE: 16,
} as const;

// Connections for drawing the skeleton
export const SKELETON_PAIRS: [number, number][] = [
  [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER],
  [KP.LEFT_SHOULDER, KP.LEFT_ELBOW],
  [KP.LEFT_ELBOW, KP.LEFT_WRIST],
  [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW],
  [KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
  [KP.LEFT_SHOULDER, KP.LEFT_HIP],
  [KP.RIGHT_SHOULDER, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.RIGHT_HIP],
  [KP.LEFT_HIP, KP.LEFT_KNEE],
  [KP.LEFT_KNEE, KP.LEFT_ANKLE],
  [KP.RIGHT_HIP, KP.RIGHT_KNEE],
  [KP.RIGHT_KNEE, KP.RIGHT_ANKLE],
];

// Parse the flat float32 output from MoveNet into Keypoint[]
// MoveNet output shape: [1, 1, 17, 3] → flat [y0,x0,s0, y1,x1,s1, ...]
export function parseMoveNetOutput(output: Float32Array | number[]): Keypoint[] {
  const kps: Keypoint[] = [];
  for (let i = 0; i < 17; i++) {
    kps.push({ y: output[i * 3], x: output[i * 3 + 1], score: output[i * 3 + 2] });
  }
  return kps;
}

// Angle at joint B formed by A–B–C in degrees
export function jointAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const bax = a.x - b.x, bay = a.y - b.y;
  const bcx = c.x - b.x, bcy = c.y - b.y;
  const dot = bax * bcx + bay * bcy;
  const mag = Math.sqrt(bax ** 2 + bay ** 2) * Math.sqrt(bcx ** 2 + bcy ** 2);
  if (mag < 1e-6) return 180;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag))) * (180 / Math.PI);
}

function visible(kps: Keypoint[], ...idxs: number[]): boolean {
  return idxs.every(i => (kps[i]?.score ?? 0) > 0.3);
}

function avg(a: number, b: number) { return (a + b) / 2; }

// ── Per-exercise rep tracking ──────────────────────────────────────────────
//
// getProgress returns a 0–1 value:
//   0 = starting / resting position
//   1 = fully contracted / bottom position
//
// A rep is counted when progress climbs above downThreshold
// then falls back below upThreshold.

export interface FormIssue {
  cue: string; // short actionable coaching cue
}

export interface ExerciseConfig {
  getProgress: (kps: Keypoint[]) => number | null;
  downThreshold: number;
  upThreshold: number;
  checkForm: (kps: Keypoint[]) => FormIssue | null;
  autoCount: boolean; // false = prompt user to tap +rep instead
}

function squat(kps: Keypoint[]): number | null {
  const useSide = (kps[KP.LEFT_KNEE]?.score ?? 0) >= (kps[KP.RIGHT_KNEE]?.score ?? 0) ? 'L' : 'R';
  const hip   = kps[useSide === 'L' ? KP.LEFT_HIP   : KP.RIGHT_HIP];
  const knee  = kps[useSide === 'L' ? KP.LEFT_KNEE  : KP.RIGHT_KNEE];
  const ankle = kps[useSide === 'L' ? KP.LEFT_ANKLE : KP.RIGHT_ANKLE];
  if (!hip || !knee || !ankle || knee.score < 0.3) return null;
  const ang = jointAngle(hip, knee, ankle); // ~170° standing, ~70° deep squat
  return Math.max(0, Math.min(1, (170 - ang) / 100));
}

function elbowAngleProgress(kps: Keypoint[], fullAngle = 170, range = 110): number | null {
  const lOk = visible(kps, KP.LEFT_SHOULDER, KP.LEFT_ELBOW, KP.LEFT_WRIST);
  const rOk = visible(kps, KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW, KP.RIGHT_WRIST);
  if (!lOk && !rOk) return null;
  const ang = lOk
    ? jointAngle(kps[KP.LEFT_SHOULDER], kps[KP.LEFT_ELBOW], kps[KP.LEFT_WRIST])
    : jointAngle(kps[KP.RIGHT_SHOULDER], kps[KP.RIGHT_ELBOW], kps[KP.RIGHT_WRIST]);
  return Math.max(0, Math.min(1, (fullAngle - ang) / range));
}

function hipHeightProgress(kps: Keypoint[]): number | null {
  if (!visible(kps, KP.LEFT_HIP, KP.RIGHT_HIP, KP.LEFT_KNEE, KP.RIGHT_KNEE)) return null;
  const hipY  = avg(kps[KP.LEFT_HIP].y, kps[KP.RIGHT_HIP].y);
  const kneeY = avg(kps[KP.LEFT_KNEE].y, kps[KP.RIGHT_KNEE].y);
  // At the bottom of a deadlift hips approach knee height → kneeY - hipY → 0
  // At lockout hips are well above knees → kneeY - hipY large
  const diff = kneeY - hipY; // positive = hips above knees
  return Math.max(0, Math.min(1, 1 - diff / 0.3));
}

function overheadProgress(kps: Keypoint[]): number | null {
  if (!visible(kps, KP.LEFT_SHOULDER, KP.LEFT_WRIST) && !visible(kps, KP.RIGHT_SHOULDER, KP.RIGHT_WRIST)) return null;
  const shoulderY = avg(kps[KP.LEFT_SHOULDER]?.y ?? 0, kps[KP.RIGHT_SHOULDER]?.y ?? 0);
  const wristY    = avg(kps[KP.LEFT_WRIST]?.y ?? 0, kps[KP.RIGHT_WRIST]?.y ?? 0);
  // Smaller y = higher on screen; wrists above shoulders → negative difference
  const diff = shoulderY - wristY; // positive = wrists above shoulder
  return Math.max(0, Math.min(1, diff / 0.25));
}

function hipThrustProgress(kps: Keypoint[]): number | null {
  if (!visible(kps, KP.LEFT_HIP, KP.LEFT_KNEE, KP.LEFT_SHOULDER)) return null;
  const ang = jointAngle(kps[KP.LEFT_SHOULDER], kps[KP.LEFT_HIP], kps[KP.LEFT_KNEE]);
  // ~90° flat on ground, ~180° full lockout
  return Math.max(0, Math.min(1, (ang - 90) / 85));
}

// ── Form checks ────────────────────────────────────────────────────────────

function checkSquatForm(kps: Keypoint[]): FormIssue | null {
  if (!visible(kps, KP.LEFT_KNEE, KP.LEFT_ANKLE, KP.RIGHT_KNEE, KP.RIGHT_ANKLE)) return null;
  // Knees should track over toes — cave inward if knee X is inside ankle X
  const lKneeIn = kps[KP.LEFT_KNEE].x  < kps[KP.LEFT_ANKLE].x  - 0.04;
  const rKneeIn = kps[KP.RIGHT_KNEE].x > kps[KP.RIGHT_ANKLE].x + 0.04;
  if (lKneeIn || rKneeIn) return { cue: 'Push your knees out — drive them over your toes' };
  return null;
}

function checkPushUpForm(kps: Keypoint[]): FormIssue | null {
  if (!visible(kps, KP.LEFT_SHOULDER, KP.LEFT_HIP, KP.LEFT_ANKLE)) return null;
  const shoulderY = kps[KP.LEFT_SHOULDER].y;
  const hipY      = kps[KP.LEFT_HIP].y;
  const ankleY    = kps[KP.LEFT_ANKLE].y;
  const ideal     = shoulderY + (ankleY - shoulderY) * 0.5;
  if (hipY > ideal + 0.06) return { cue: 'Squeeze your glutes — keep your hips level' };
  if (hipY < ideal - 0.06) return { cue: 'Lower your hips — your body should form one line' };
  return null;
}

function checkDeadliftForm(kps: Keypoint[]): FormIssue | null {
  if (!visible(kps, KP.LEFT_SHOULDER, KP.LEFT_HIP, KP.LEFT_KNEE)) return null;
  const ang = jointAngle(kps[KP.LEFT_SHOULDER], kps[KP.LEFT_HIP], kps[KP.LEFT_KNEE]);
  if (ang < 125) return { cue: 'Chest up — keep your back flat and proud' };
  return null;
}

function checkCurlForm(kps: Keypoint[]): FormIssue | null {
  if (!visible(kps, KP.LEFT_SHOULDER, KP.LEFT_ELBOW)) return null;
  if (Math.abs(kps[KP.LEFT_ELBOW].x - kps[KP.LEFT_SHOULDER].x) > 0.13) {
    return { cue: 'Pin your elbow to your side — no swinging' };
  }
  return null;
}

// ── Config map ─────────────────────────────────────────────────────────────

export function getExerciseConfig(exerciseName: string): ExerciseConfig {
  const n = exerciseName.toLowerCase();

  if (n.includes('squat')) return {
    getProgress: squat,
    downThreshold: 0.52, upThreshold: 0.18,
    checkForm: checkSquatForm, autoCount: true,
  };

  if (n.includes('deadlift')) return {
    getProgress: hipHeightProgress,
    downThreshold: 0.6, upThreshold: 0.2,
    checkForm: checkDeadliftForm, autoCount: true,
  };

  if (n.includes('push')) return {
    getProgress: (kps) => elbowAngleProgress(kps, 170, 100),
    downThreshold: 0.55, upThreshold: 0.15,
    checkForm: checkPushUpForm, autoCount: true,
  };

  if (n.includes('curl')) return {
    getProgress: (kps) => elbowAngleProgress(kps, 165, 120),
    downThreshold: 0.58, upThreshold: 0.15,
    checkForm: checkCurlForm, autoCount: true,
  };

  if (n.includes('press') || n.includes('overhead')) return {
    getProgress: overheadProgress,
    downThreshold: 0.5, upThreshold: 0.12,
    checkForm: () => null, autoCount: true,
  };

  if (n.includes('row')) return {
    getProgress: (kps) => elbowAngleProgress(kps, 170, 80),
    downThreshold: 0.55, upThreshold: 0.15,
    checkForm: () => null, autoCount: true,
  };

  if (n.includes('hip thrust') || n.includes('glute bridge')) return {
    getProgress: hipThrustProgress,
    downThreshold: 0.65, upThreshold: 0.2,
    checkForm: () => null, autoCount: true,
  };

  if (n.includes('lunge')) return {
    getProgress: squat, // same joint logic
    downThreshold: 0.5, upThreshold: 0.15,
    checkForm: () => null, autoCount: true,
  };

  // Unknown exercise — show skeleton, let user count manually
  return {
    getProgress: () => null,
    downThreshold: 0.5, upThreshold: 0.2,
    checkForm: () => null, autoCount: false,
  };
}

// ── Rep counting state machine ─────────────────────────────────────────────
// Call tick() on every frame with the current progress value.
// Returns true when a rep is completed.

export type RepPhase = 'waiting' | 'contracted' | 'complete';

export class RepCounter {
  phase: RepPhase = 'waiting';
  private down: number;
  private up: number;

  constructor(downThreshold: number, upThreshold: number) {
    this.down = downThreshold;
    this.up   = upThreshold;
  }

  tick(progress: number): boolean {
    if (this.phase === 'waiting' && progress >= this.down) {
      this.phase = 'contracted';
      return false;
    }
    if (this.phase === 'contracted' && progress <= this.up) {
      this.phase = 'waiting';
      return true; // rep completed
    }
    return false;
  }
}

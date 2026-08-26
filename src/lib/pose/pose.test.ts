// Unit tests for the Form Coach detection pipeline.
//
// Run with:  npm run test:pose
//
// These drive the pipeline with synthetic skeletons rather than a camera, so
// rep counting and the form rules are verifiable without a device — which is
// the whole reason the pipeline is kept free of React Native imports.

import test from 'node:test';
import assert from 'node:assert/strict';

import type { Landmarks, PoseFrame } from './types';
import { OneEuroFilter, Debouncer } from './filter';
import { angleAt, boundingBox, torsoScale } from './geometry';
import { profileFor, depthFromAngle, measureAngle } from './profiles';
import { RepDetector } from './repDetector';
import { analyzeFraming } from './framing';
import { FormCoachSession } from './session';
import { normalizeLandmarks } from './nativePose';

// ── Synthetic skeleton ────────────────────────────────────────────────────

const DEG = Math.PI / 180;

/** Unit vector pointing "down the frame" (0,1), rotated by `deg` toward +x. */
function dirFromDown(deg: number): { x: number; y: number } {
  return { x: Math.sin(deg * DEG), y: Math.cos(deg * DEG) };
}

/**
 * Build a side-on squat skeleton at a given knee angle.
 *
 * The segments move the way a real squat's do: as the knee closes, the thigh
 * rotates toward horizontal and the torso leans forward. That coupling is the
 * point — hip angle has to actually change over the rep, otherwise the hip
 * fallback source cannot be exercised. (An earlier version of this helper
 * pinned the hip and thigh in place, which silently made the fallback look
 * broken when it was the fixture that was wrong.)
 */
function squatSkeleton(kneeDeg: number, opts: {
  score?: number;
  /** Horizontal knee separation as a fraction of ankle separation. */
  valgus?: number;
  /** Extra forward torso lean, degrees, on top of the natural amount. */
  extraLean?: number;
  dropAnkles?: boolean;
} = {}): Landmarks {
  const score = opts.score ?? 0.9;
  const valgus = opts.valgus ?? 1;
  const extraLean = opts.extraLean ?? 0;

  const TOP_KNEE = 175;
  const BOTTOM_KNEE = 72;
  const p = Math.max(0, Math.min(1, (TOP_KNEE - kneeDeg) / (TOP_KNEE - BOTTOM_KNEE)));

  // Standing → parallel: the thigh swings from vertical toward horizontal and
  // the torso leans forward to keep the bar over mid-foot.
  const thighTilt = 2 + p * 73;
  const torsoLean = 8 + p * 34 + extraLean;

  const thighLen = 0.18;
  const shankLen = 0.18;
  const torsoLen = 0.22;

  const hip = { x: 0.4, y: 0.42 };
  const thighDir = dirFromDown(thighTilt);
  const knee = { x: hip.x + thighLen * thighDir.x, y: hip.y + thighLen * thighDir.y };

  // Shank rotated off the thigh direction to realize exactly `kneeDeg`.
  const shankDir = dirFromDown(thighTilt - (180 - kneeDeg));
  const ankle = { x: knee.x + shankLen * shankDir.x, y: knee.y + shankLen * shankDir.y };

  // Torso points up-and-forward from the hip.
  const shoulder = {
    x: hip.x + torsoLen * Math.sin(torsoLean * DEG),
    y: hip.y - torsoLen * Math.cos(torsoLean * DEG),
  };

  const ankleGap = 0.06;
  const kneeGap = ankleGap * valgus;

  const lm: Landmarks = {
    nose: { x: shoulder.x + 0.02, y: shoulder.y - 0.08, score },
    left_shoulder: { x: shoulder.x - 0.04, y: shoulder.y, score },
    right_shoulder: { x: shoulder.x + 0.04, y: shoulder.y, score },
    left_hip: { x: hip.x - 0.03, y: hip.y, score },
    right_hip: { x: hip.x + 0.03, y: hip.y, score },
    left_knee: { x: knee.x - kneeGap / 2, y: knee.y, score },
    right_knee: { x: knee.x + kneeGap / 2, y: knee.y, score },
  };

  if (!opts.dropAnkles) {
    lm.left_ankle = { x: ankle.x - ankleGap / 2, y: ankle.y, score };
    lm.right_ankle = { x: ankle.x + ankleGap / 2, y: ankle.y, score };
  }

  return lm;
}

/** Feed a squat rep of the given depth into a consumer, frame by frame. */
function playSquatRep(
  push: (frame: PoseFrame) => void,
  opts: {
    startT: number;
    bottomDeg: number;
    downMs: number;
    upMs: number;
    fps?: number;
    skeleton?: (deg: number) => Landmarks;
  }
): number {
  const fps = opts.fps ?? 30;
  const step = 1000 / fps;
  const build = opts.skeleton ?? ((deg: number) => squatSkeleton(deg));
  const top = 175;
  let t = opts.startT;

  const downFrames = Math.max(2, Math.round(opts.downMs / step));
  for (let i = 0; i <= downFrames; i++) {
    const deg = top + (opts.bottomDeg - top) * (i / downFrames);
    push({ t, landmarks: build(deg), brightness: 0.5 });
    t += step;
  }
  const upFrames = Math.max(2, Math.round(opts.upMs / step));
  for (let i = 1; i <= upFrames; i++) {
    const deg = opts.bottomDeg + (top - opts.bottomDeg) * (i / upFrames);
    push({ t, landmarks: build(deg), brightness: 0.5 });
    t += step;
  }
  // Settle at the top so the detector sees a clean return.
  for (let i = 0; i < 6; i++) {
    push({ t, landmarks: build(top), brightness: 0.5 });
    t += step;
  }
  return t;
}

// ── Geometry ──────────────────────────────────────────────────────────────

test('angleAt measures the interior angle at the vertex', () => {
  assert.equal(Math.round(angleAt({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })), 90);
  assert.equal(Math.round(angleAt({ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 })), 180);
});

test('synthetic skeleton produces the knee angle it was asked for', () => {
  for (const deg of [175, 140, 110, 80]) {
    const measured = measureAngle(squatSkeleton(deg), 'knee');
    assert.ok(measured, `expected a knee angle at ${deg}`);
    assert.ok(
      Math.abs(measured.value - deg) < 2,
      `knee angle ${measured.value.toFixed(1)} should be within 2° of ${deg}`
    );
  }
});

test('boundingBox and torsoScale describe the subject', () => {
  const box = boundingBox(squatSkeleton(175));
  assert.ok(box);
  assert.ok(box.height > 0.3 && box.height < 1);
  assert.ok((torsoScale(squatSkeleton(175)) ?? 0) > 0.1);
});

// ── Filters ───────────────────────────────────────────────────────────────

test('OneEuroFilter suppresses jitter but tracks a real ramp', () => {
  const noisy = new OneEuroFilter();
  let t = 0;
  const outputs: number[] = [];
  // Static signal at 100 with ±4 of noise.
  for (let i = 0; i < 60; i++) {
    outputs.push(noisy.filter(100 + (i % 2 === 0 ? 4 : -4), t));
    t += 33;
  }
  const tail = outputs.slice(-20);
  const spread = Math.max(...tail) - Math.min(...tail);
  assert.ok(spread < 3, `expected jitter to be smoothed, got spread ${spread.toFixed(2)}`);

  // A genuine 100 → 160 ramp must still be followed closely.
  const ramp = new OneEuroFilter();
  let rt = 0;
  let last = 0;
  for (let i = 0; i <= 30; i++) {
    last = ramp.filter(100 + (60 * i) / 30, rt);
    rt += 33;
  }
  assert.ok(last > 150, `expected the filter to reach the ramp, got ${last.toFixed(1)}`);
});

test('Debouncer needs a majority before flipping', () => {
  const d = new Debouncer(5, 0.6);
  d.push(true);
  d.push(false);
  d.push(false);
  assert.equal(d.value, false);
  d.push(true);
  d.push(true);
  assert.equal(d.value, true);
});

// ── Profiles ──────────────────────────────────────────────────────────────

test('profileFor matches exercise names and falls back cleanly', () => {
  assert.equal(profileFor('Back Squat').id, 'squat');
  assert.equal(profileFor('Romanian Deadlift').id, 'hinge');
  assert.equal(profileFor('Barbell Bicep Curl').id, 'curl');
  assert.equal(profileFor('Push-Up').id, 'pushup');
  assert.equal(profileFor('Something Nobody Has Heard Of').id, 'generic');
});

test('depthFromAngle works for movements that open AND close the joint', () => {
  const squat = profileFor('Back Squat');
  assert.ok(depthFromAngle(squat, squat.topAngle) < 0.02);
  assert.ok(depthFromAngle(squat, squat.bottomAngle) > 0.98);

  // Hip thrust locks out by OPENING the hip: bottomAngle > topAngle.
  const thrust = profileFor('Hip Thrust');
  assert.ok(thrust.bottomAngle > thrust.topAngle);
  assert.ok(depthFromAngle(thrust, thrust.topAngle) < 0.02);
  assert.ok(depthFromAngle(thrust, thrust.bottomAngle) > 0.98);
});

// ── Rep detection ─────────────────────────────────────────────────────────

test('counts clean squat reps', () => {
  const detector = new RepDetector(profileFor('Back Squat'));
  let t = 0;
  for (let i = 0; i < 5; i++) {
    t = playSquatRep(f => detector.push(f), {
      startT: t, bottomDeg: 78, downMs: 1200, upMs: 900,
    });
  }
  assert.equal(detector.reps, 5);
});

test('does not count a shallow partial as a rep', () => {
  const detector = new RepDetector(profileFor('Back Squat'));
  let t = 0;
  for (let i = 0; i < 4; i++) {
    // Barely bends the knees — nowhere near the bottom threshold.
    t = playSquatRep(f => detector.push(f), {
      startT: t, bottomDeg: 150, downMs: 800, upMs: 700,
    });
  }
  assert.equal(detector.reps, 0);
});

test('does not count jitter around the top as reps', () => {
  const detector = new RepDetector(profileFor('Back Squat'));
  let t = 0;
  // Standing still, with the detector wobbling the knee angle a few degrees.
  for (let i = 0; i < 300; i++) {
    const deg = 172 + (i % 2 === 0 ? 5 : -5);
    detector.push({ t, landmarks: squatSkeleton(deg), brightness: 0.5 });
    t += 33;
  }
  assert.equal(detector.reps, 0);
});

test('ignores a bounce that never reaches the bottom', () => {
  const detector = new RepDetector(profileFor('Back Squat'));
  let t = 0;
  // Dips to 120° — past the top threshold, short of the bottom one.
  t = playSquatRep(f => detector.push(f), {
    startT: t, bottomDeg: 120, downMs: 600, upMs: 600,
  });
  assert.equal(detector.reps, 0);

  // A real rep straight afterwards still counts — the abandoned attempt must
  // not have left the state machine stuck.
  playSquatRep(f => detector.push(f), {
    startT: t, bottomDeg: 78, downMs: 1100, upMs: 900,
  });
  assert.equal(detector.reps, 1);
});

test('rep events carry usable tempo and depth data', () => {
  const detector = new RepDetector(profileFor('Back Squat'));
  let captured: ReturnType<RepDetector['push']>['rep'] = null;
  playSquatRep(
    f => {
      const tick = detector.push(f);
      if (tick.rep) captured = tick.rep;
    },
    { startT: 0, bottomDeg: 75, downMs: 1500, upMs: 800 }
  );
  assert.ok(captured, 'expected a rep event');
  const rep = captured as NonNullable<typeof captured>;
  assert.equal(rep.index, 1);
  assert.ok(rep.peakDepth > 0.9, `peakDepth ${rep.peakDepth}`);
  // Eccentric was the longer half of this rep.
  assert.ok(rep.eccentricMs > rep.concentricMs, 'eccentric should dominate');
  assert.ok(rep.durationMs > 1500 && rep.durationMs < 3500, `durationMs ${rep.durationMs}`);
});

test('survives a brief occlusion mid-rep without losing the count', () => {
  const detector = new RepDetector(profileFor('Back Squat'));
  let t = 0;
  const frames: PoseFrame[] = [];
  playSquatRep(f => frames.push(f), { startT: t, bottomDeg: 78, downMs: 1200, upMs: 900 });

  frames.forEach((f, i) => {
    // Blank out five frames on the way down, as if someone walked past.
    const occluded = i >= 12 && i < 17;
    detector.push(occluded ? { t: f.t, landmarks: {}, brightness: 0.5 } : f);
  });
  assert.equal(detector.reps, 1);
});

test('counts squat reps with the feet out of shot, via the hip fallback', () => {
  const session = new FormCoachSession('Back Squat');
  let t = 0;
  for (let i = 0; i < 5; i++) {
    t = playSquatRep(f => session.push(f), {
      startT: t, bottomDeg: 78, downMs: 1200, upMs: 900,
      skeleton: deg => squatSkeleton(deg, { dropAnkles: true }),
    });
  }
  const summary = session.summary();
  assert.equal(summary.reps, 5, 'hips + knees alone must be enough to count a squat');
  // And it should have said so — the set was measured on hip angle, not knee.
  assert.ok(summary.averageScore > 0);
});

test('latches one angle source for the whole set', () => {
  const detector = new RepDetector(profileFor('Back Squat'));
  // Start with no ankles, so the hip fallback latches...
  let t = playSquatRep(f => detector.push(f), {
    startT: 0, bottomDeg: 78, downMs: 1200, upMs: 900,
    skeleton: deg => squatSkeleton(deg, { dropAnkles: true }),
  });
  const latched = detector.activeSource;
  assert.equal(latched?.angle, 'hip');

  // ...then the ankles appear. The source must NOT switch mid-set: a jump
  // between two differently-scaled angles would fabricate a rep.
  playSquatRep(f => detector.push(f), {
    startT: t, bottomDeg: 78, downMs: 1200, upMs: 900,
  });
  assert.equal(detector.activeSource?.angle, 'hip');
  assert.equal(detector.reps, 2);
});

// ── Framing ───────────────────────────────────────────────────────────────

test('framing accepts a partial skeleton when the exercise allows it', () => {
  const squat = profileFor('Back Squat');
  // Hips and knees only — no ankles, no feet. This is the case the old
  // "stand six feet back so I can see you head to toe" rule rejected.
  const lm = squatSkeleton(120, { dropAnkles: true });
  const result = analyzeFraming({ t: 0, landmarks: lm, brightness: 0.5 }, squat);
  assert.equal(result.trackable, true, `expected trackable, got ${result.code}: ${result.message}`);
});

test('framing rejects a curl skeleton for a squat but accepts it for a curl', () => {
  const upperBodyOnly: Landmarks = {
    left_shoulder: { x: 0.4, y: 0.3, score: 0.9 },
    right_shoulder: { x: 0.6, y: 0.3, score: 0.9 },
    left_elbow: { x: 0.38, y: 0.5, score: 0.9 },
    right_elbow: { x: 0.62, y: 0.5, score: 0.9 },
    left_wrist: { x: 0.38, y: 0.7, score: 0.9 },
    right_wrist: { x: 0.62, y: 0.7, score: 0.9 },
    left_hip: { x: 0.44, y: 0.66, score: 0.9 },
    right_hip: { x: 0.56, y: 0.66, score: 0.9 },
  };
  const frame: PoseFrame = { t: 0, landmarks: upperBodyOnly, brightness: 0.5 };

  assert.equal(analyzeFraming(frame, profileFor('Bicep Curl')).trackable, true);

  const squatResult = analyzeFraming(frame, profileFor('Back Squat'));
  assert.equal(squatResult.trackable, false);
  assert.match(squatResult.message, /knee/i);
});

test('framing distinguishes darkness from absence', () => {
  const squat = profileFor('Back Squat');

  const empty = analyzeFraming({ t: 0, landmarks: {}, brightness: 0.6 }, squat);
  assert.equal(empty.code, 'no_person');
  assert.equal(empty.suggestTorch, false);

  const dark = analyzeFraming({ t: 0, landmarks: {}, brightness: 0.05 }, squat);
  assert.equal(dark.code, 'too_dark');
  assert.equal(dark.suggestTorch, true);
});

test('framing tells the user to step back when joints are cropped out', () => {
  const lm = squatSkeleton(120);
  // Push the knees below the bottom edge of the frame.
  lm.left_knee!.y = 1.12;
  lm.right_knee!.y = 1.14;
  const result = analyzeFraming({ t: 0, landmarks: lm, brightness: 0.5 }, profileFor('Back Squat'));
  assert.equal(result.code, 'too_close');
  assert.match(result.message, /step back/i);
});

test('framing flags a subject too small to resolve', () => {
  const lm = squatSkeleton(175);
  for (const kp of Object.values(lm)) {
    if (kp) {
      kp.y = 0.5 + (kp.y - 0.5) * 0.15;
      kp.x = 0.5 + (kp.x - 0.5) * 0.15;
    }
  }
  const result = analyzeFraming({ t: 0, landmarks: lm, brightness: 0.5 }, profileFor('Back Squat'));
  assert.equal(result.code, 'too_far');
});

test('dim light alone does not block tracking when confidence holds up', () => {
  const lm = squatSkeleton(120, { score: 0.85 });
  const result = analyzeFraming({ t: 0, landmarks: lm, brightness: 0.1 }, profileFor('Back Squat'));
  assert.equal(result.trackable, true, `a dim gym should still track, got ${result.code}`);
});

// ── Form rules ────────────────────────────────────────────────────────────

test('scores a clean rep high and a shallow one lower', () => {
  const clean = new FormCoachSession('Back Squat');
  playSquatRep(f => clean.push(f), { startT: 0, bottomDeg: 72, downMs: 1400, upMs: 900 });
  const cleanScore = clean.summary().averageScore;

  const shallow = new FormCoachSession('Back Squat');
  playSquatRep(f => shallow.push(f), { startT: 0, bottomDeg: 108, downMs: 1400, upMs: 900 });
  const shallowSummary = shallow.summary();

  assert.equal(shallowSummary.reps, 1, 'the shallow rep should still count');
  assert.ok(
    shallowSummary.averageScore < cleanScore,
    `shallow ${shallowSummary.averageScore} should score below clean ${cleanScore}`
  );
  assert.ok(
    shallowSummary.topIssues.some(i => /deeper/i.test(i.cue)),
    `expected a depth cue, got ${JSON.stringify(shallowSummary.topIssues)}`
  );
});

test('detects knees caving in', () => {
  const session = new FormCoachSession('Back Squat');
  playSquatRep(f => session.push(f), {
    startT: 0, bottomDeg: 75, downMs: 1400, upMs: 900,
    skeleton: deg => squatSkeleton(deg, { valgus: 0.5 }),
  });
  const summary = session.summary();
  assert.ok(
    summary.topIssues.some(i => /knees out/i.test(i.cue)),
    `expected a valgus cue, got ${JSON.stringify(summary.topIssues)}`
  );
});

test('detects an excessively fast eccentric', () => {
  const session = new FormCoachSession('Back Squat');
  playSquatRep(f => session.push(f), { startT: 0, bottomDeg: 75, downMs: 200, upMs: 900 });
  const summary = session.summary();
  assert.ok(
    summary.topIssues.some(i => /slow/i.test(i.cue)),
    `expected a tempo cue, got ${JSON.stringify(summary.topIssues)}`
  );
});

test('detects a forward-folding torso', () => {
  const session = new FormCoachSession('Back Squat');
  playSquatRep(f => session.push(f), {
    startT: 0, bottomDeg: 75, downMs: 1400, upMs: 900,
    skeleton: deg => squatSkeleton(deg, { extraLean: 38 }),
  });
  const summary = session.summary();
  assert.ok(
    summary.topIssues.some(i => /chest up/i.test(i.cue)),
    `expected a torso cue, got ${JSON.stringify(summary.topIssues)}`
  );
});

// ── Session ───────────────────────────────────────────────────────────────

test('session reports framing problems instead of failing silently', () => {
  const session = new FormCoachSession('Back Squat');
  const tick = session.push({ t: 0, landmarks: {}, brightness: 0.5 });
  assert.equal(tick.reps, 0);
  assert.equal(tick.framing.trackable, false);
  assert.ok(tick.cue, 'an untrackable frame must produce a cue telling the user what to fix');
});

test('session throttles repeated framing nags', () => {
  const session = new FormCoachSession('Back Squat');
  let cues = 0;
  for (let t = 0; t < 3000; t += 33) {
    if (session.push({ t, landmarks: {}, brightness: 0.5 }).cue) cues++;
  }
  assert.ok(cues >= 1, 'should warn at least once');
  assert.ok(cues <= 3, `should not nag every frame, got ${cues}`);
});

test('session counts a full set and summarizes it', () => {
  const session = new FormCoachSession('Back Squat');
  let t = 0;
  for (let i = 0; i < 8; i++) {
    t = playSquatRep(f => session.push(f), {
      startT: t, bottomDeg: 76, downMs: 1300, upMs: 850,
    });
  }
  const summary = session.summary();
  assert.equal(summary.reps, 8);
  assert.equal(summary.repScores.length, 8);
  assert.ok(summary.averageScore > 60);
  assert.ok(summary.averageRepMs > 1000);
  assert.ok(summary.trackingQuality > 0.5);
});

test('manual rep adjustment keeps the counter in sync', () => {
  const session = new FormCoachSession('Back Squat');
  playSquatRep(f => session.push(f), { startT: 0, bottomDeg: 76, downMs: 1300, upMs: 850 });
  assert.equal(session.reps, 1);
  assert.equal(session.adjustReps(1), 2);
  assert.equal(session.adjustReps(-1), 1);
  assert.equal(session.adjustReps(-5), 0);
});

// ── Native adapter ────────────────────────────────────────────────────────

test('normalizeLandmarks handles the shapes detectors actually return', () => {
  const keyed = normalizeLandmarks({
    leftKnee: { x: 0.4, y: 0.6, score: 0.8 },
    right_knee: { x: 0.6, y: 0.6, visibility: 0.7 },
  });
  assert.ok(keyed.left_knee);
  assert.equal(keyed.left_knee!.score, 0.8);
  assert.equal(keyed.right_knee!.score, 0.7);

  const movenet = normalizeLandmarks(
    Array.from({ length: 17 }, (_, i) => ({ x: i / 17, y: 0.5, score: 0.9 }))
  );
  assert.ok(movenet.nose);
  assert.ok(movenet.left_ankle);

  const blazepose = normalizeLandmarks(
    Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
  );
  assert.ok(blazepose.left_shoulder);
  assert.ok(blazepose.left_foot_index);

  // Garbage in must not throw.
  assert.deepEqual(normalizeLandmarks(null), {});
  assert.deepEqual(normalizeLandmarks([{ nope: 1 }]), {});
});

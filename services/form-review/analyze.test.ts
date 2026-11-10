import assert from 'node:assert/strict';
import test from 'node:test';
import type { PoseFrame } from '../../src/lib/pose/types';
import { analyzeFrames, REVIEW_EXERCISES } from './analyze';

function squatFrame(t: number, kneeAngle: number, score = 0.9): PoseFrame {
  const shankAngle = (180 - kneeAngle) * Math.PI / 180;
  return {
    t,
    xMax: 1.4,
    landmarks: {
      left_shoulder: { x: 0.5, y: 0.12, score },
      left_hip: { x: 0.5, y: 0.3, score },
      left_knee: { x: 0.5, y: 0.53, score },
      left_ankle: {
        x: 0.5 + Math.sin(shankAngle) * 0.24,
        y: 0.53 + Math.cos(shankAngle) * 0.24,
        score,
      },
    },
  };
}

function squatRep(score = 0.9): PoseFrame[] {
  return Array.from({ length: 40 }, (_, index) => {
    const depth = Math.min(1, index / 17, Math.max(0, (33 - index) / 16));
    return squatFrame(index * 100, 175 - depth * 103, score);
  });
}

test('review accepts only the four supported catalog exercises', () => {
  assert.deepEqual(REVIEW_EXERCISES, {
    squat: 'Back Squat',
    goblet_squat: 'Goblet Squat',
    rdl: 'Romanian Deadlift',
    push_up: 'Push-Up',
  });
});

test('review returns measured metrics for a trackable rep', () => {
  const result = analyzeFrames('squat', squatRep());
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.summary.reps, 1);
  assert.equal(result.summary.profileId, 'squat');
  assert.equal(result.summary.trackingQuality, 0.9);
  assert.equal(result.summary.repScores.length, 1);
});

test('review gives lighting guidance when a dark clip cannot be tracked', () => {
  const result = analyzeFrames('squat', [
    { t: 0, landmarks: {}, brightness: 0.05 },
    { t: 100, landmarks: {}, brightness: 0.05 },
  ]);
  assert.equal(result.status, 'retake');
  if (result.status === 'retake') assert.match(result.cue, /light/i);
});

test('review rejects a rep measured with weak landmarks', () => {
  assert.equal(analyzeFrames('squat', squatRep(0.55)).status, 'retake');
});

test('review asks for a full rep when tracking is clear but the clip is stationary', () => {
  const frames = Array.from({ length: 20 }, (_, index) => squatFrame(index * 100, 175));
  const result = analyzeFrames('squat', frames);
  assert.equal(result.status, 'retake');
  if (result.status === 'retake') assert.match(result.cue, /full rep/i);
});

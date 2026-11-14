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

test('review accepts only the supported catalog exercises', () => {
  assert.deepEqual(REVIEW_EXERCISES, {
    squat: 'Back Squat',
    goblet_squat: 'Goblet Squat',
    rdl: 'Romanian Deadlift',
    push_up: 'Push-Up',
    kb_swing: 'Kettlebell Swing',
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

function quickHingeRep(): PoseFrame[] {
  return Array.from({ length: 35 }, (_, index): PoseFrame => {
    const depth = Math.max(0, Math.min((index - 6) / 6, (18 - index) / 6));
    const hipX = 0.65 - 0.06 * depth;
    const hipY = 0.50 + 0.05 * depth;
    const torsoLean = Math.PI / 3 * depth;
    const score = 0.9;
    return {
      t: Math.round(index * 1000 / 15),
      xMax: 1.4,
      landmarks: {
        left_shoulder: {
          x: hipX + Math.sin(torsoLean) * 0.23,
          y: hipY - Math.cos(torsoLean) * 0.23,
          score,
        },
        left_hip: { x: hipX, y: hipY, score },
        left_knee: { x: 0.65 + 0.025 * depth, y: 0.71, score },
        left_ankle: { x: 0.65, y: 0.93, score },
      },
    };
  });
}

test('review detects a full kettlebell swing without a slow-lowering cue', () => {
  const result = analyzeFrames('kb_swing', quickHingeRep());
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.equal(result.summary.profileId, 'hinge');
  assert.equal(result.summary.reps, 1);
  assert.deepEqual(result.summary.topIssues, []);
});

test('review still cues a fast descent on a Romanian deadlift', () => {
  const result = analyzeFrames('rdl', quickHingeRep());
  assert.equal(result.status, 'ok');
  if (result.status !== 'ok') return;
  assert.match(result.summary.topIssues[0].cue, /slow the way down/i);
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

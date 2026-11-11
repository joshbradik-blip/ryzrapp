import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timedExerciseSeconds, elapsedSeconds } from './timedExercise';

test('detects timed prescriptions without treating reps as seconds', () => {
  for (const prescription of ['30-45s', '30–45 seconds', '30 sec']) {
    assert.equal(timedExerciseSeconds('custom_hold', prescription), 30);
  }
  assert.equal(timedExerciseSeconds('custom_hold', '2 min'), 120);
  assert.equal(timedExerciseSeconds('custom_hold', '1.5 minutes'), 90);
  assert.equal(timedExerciseSeconds('lunge', '10-12/leg'), null);
  assert.equal(timedExerciseSeconds('squat', '8-10'), null);
  assert.equal(timedExerciseSeconds('plank', '30'), 30);
  assert.equal(timedExerciseSeconds('plank', '45'), 45);
  assert.equal(timedExerciseSeconds('custom_hold', '45 seconds per side'), 45);
});

test('background time counts and paused time is excluded on resume', () => {
  assert.equal(elapsedSeconds(1000, 0, 46000), 45);
  // Resume at 60s with 45 seconds accumulated; the pause is not counted.
  assert.equal(elapsedSeconds(60000, 45000, 65000), 50);
  assert.equal(elapsedSeconds(60000, 45000, 59000), 45);
  // Fractional time from before a pause is retained in the resumed effort.
  assert.equal(elapsedSeconds(60000, 1900, 61900), 3);
});

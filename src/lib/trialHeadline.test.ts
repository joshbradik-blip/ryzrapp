import test from 'node:test';
import assert from 'node:assert/strict';
import { trialHeadline } from './trialHeadline';

test('names the feature the user tried to use', () => {
  assert.equal(trialHeadline('AI Coach Chat', '7 days'), 'Try AI Coach Chat free for 7 days');
  assert.equal(trialHeadline('AI Meal Logging', '1 week'), 'Try AI meal logging free for 1 week');
});

test('unknown or missing sources fall back to Premium', () => {
  assert.equal(trialHeadline('Today Upgrade', '7 days'), 'Try Premium free for 7 days');
  assert.equal(trialHeadline(undefined, '7 days'), 'Try Premium free for 7 days');
  assert.equal(trialHeadline('Store', '3 days'), 'Try Premium free for 3 days');
});

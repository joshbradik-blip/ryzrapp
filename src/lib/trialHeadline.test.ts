import test from 'node:test';
import assert from 'node:assert/strict';
import { trialHeadline, premiumPromptCopy } from './trialHeadline';

test('membership headline is generic, not per feature', () => {
  assert.equal(trialHeadline('1 week'), 'Try Premium free for 1 week');
  assert.equal(trialHeadline('7 days'), 'Try Premium free for 7 days');
});

test('prompt mentions the trial only when the store has one', () => {
  assert.equal(premiumPromptCopy('1 week').message, 'This is part of RYZR Premium. Try it free for 1 week.');
  assert.equal(premiumPromptCopy().message, 'This is part of RYZR Premium.');
  assert.equal(premiumPromptCopy().action, 'View Premium');
});

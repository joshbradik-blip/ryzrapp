import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBodyParts, humanizeBodyPart } from './injuries';

test('maps typed body parts onto the chip vocabulary', () => {
  assert.deepEqual(normalizeBodyParts('Left knee'), ['knees']);
  assert.deepEqual(normalizeBodyParts('my lower back'), ['lower_back']);
  assert.deepEqual(normalizeBodyParts('back pain'), ['lower_back']);
  assert.deepEqual(normalizeBodyParts('wrist'), ['wrists']);
  assert.deepEqual(normalizeBodyParts('right shoulder'), ['right_shoulder']);
});

test('a shoulder with no side covers both shoulders', () => {
  assert.deepEqual(normalizeBodyParts('shoulder'), ['left_shoulder', 'right_shoulder']);
});

test('upper back is not forced into lower back', () => {
  assert.deepEqual(normalizeBodyParts('Upper back'), ['upper_back']);
});

test('unknown parts are kept as a tag, blanks are dropped', () => {
  assert.deepEqual(normalizeBodyParts('  Plantar fascia! '), ['plantar_fascia']);
  assert.deepEqual(normalizeBodyParts('   '), []);
  assert.equal(humanizeBodyPart('plantar_fascia'), 'Plantar Fascia');
});

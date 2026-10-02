// Unit tests for whole-dish photo helpers. Run with:  npm run test:photo

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  coerceServings, servingFraction, wholeDishPromptAddendum,
  REFERENCE_OBJECTS, REFERENCE_ORDER, MAX_SERVINGS,
} from './wholeDish';

test('coerceServings defaults and clamps', () => {
  assert.equal(coerceServings(undefined), 1);
  assert.equal(coerceServings('abc'), 1);
  assert.equal(coerceServings(0), 1);
  assert.equal(coerceServings(-3), 1);
  assert.equal(coerceServings(8), 8);
  assert.equal(coerceServings(7.6), 8);
  assert.equal(coerceServings('12'), 12);
  assert.equal(coerceServings(5000), MAX_SERVINGS);
});

test('servingFraction scales and clamps', () => {
  assert.equal(servingFraction(8, 2), 0.25);
  assert.equal(servingFraction(8, 8), 1);
  assert.equal(servingFraction(8, 20), 1);
  assert.equal(servingFraction(8, -1), 0);
  assert.equal(servingFraction(0, 1), 1);
});

test('prompt addendum names the reference object and whole-dish rules', () => {
  for (const ref of REFERENCE_ORDER) {
    const p = wholeDishPromptAddendum(ref);
    assert.ok(p.includes(REFERENCE_OBJECTS[ref].description));
    assert.ok(p.includes('"servings"'));
    assert.ok(p.includes('ENTIRE dish'));
  }
});

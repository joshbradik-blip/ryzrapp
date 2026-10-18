import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costOf, PRICING } from './usageCost';

// Cost is money, and nothing downstream will catch an arithmetic slip — the
// dashboard would just show a confidently wrong number. So the rates and the
// maths are both pinned here.

test('prices Sonnet input and output at the published rates', () => {
  // 1M in at $3 + 1M out at $15 = $18
  const cost = costOf('claude-sonnet-4-6', {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.equal(cost, 18);
});

test('prices Haiku input and output at the published rates', () => {
  // 1M in at $1 + 1M out at $5 = $6
  const cost = costOf('claude-haiku-4-5-20251001', {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
  });
  assert.equal(cost, 6);
});

test('a realistic plan generation lands near a dime', () => {
  // The call that drove the whole pricing discussion: ~1.5K in, ~6K out on Sonnet.
  const cost = costOf('claude-sonnet-4-6', { input_tokens: 1_500, output_tokens: 6_000 })!;
  assert.ok(cost > 0.08 && cost < 0.12, `expected ~$0.09, got $${cost}`);
});

test('a photo calorie lookup on Haiku is far cheaper than a plan', () => {
  // ~1,568 image tokens + ~400 prompt, ~400 out.
  const photo = costOf('claude-haiku-4-5-20251001', { input_tokens: 1_968, output_tokens: 400 })!;
  const plan = costOf('claude-sonnet-4-6', { input_tokens: 1_500, output_tokens: 6_000 })!;
  assert.ok(photo < 0.01, `photo should be under a cent, got $${photo}`);
  assert.ok(plan / photo > 10, 'a plan should cost more than 10 photo lookups');
});

test('cached input is billed at a tenth, cache writes at 1.25x', () => {
  const read = costOf('claude-sonnet-4-6', { cache_read_input_tokens: 1_000_000 });
  assert.equal(read, 0.3); // $3 * 0.1

  const write = costOf('claude-sonnet-4-6', { cache_creation_input_tokens: 1_000_000 });
  assert.equal(write, 3.75); // $3 * 1.25
});

test('an unpriced model reads as unknown, never as free', () => {
  // A model swap must not silently look like the bill dropped to zero.
  assert.equal(costOf('claude-opus-5-5', { input_tokens: 1_000_000 }), null);
});

test('missing usage fields count as zero rather than throwing', () => {
  assert.equal(costOf('claude-haiku-4-5', {}), 0);
  assert.equal(costOf('claude-haiku-4-5', { input_tokens: 1_000_000 }), 1);
});

test('every priced model has positive input and output rates', () => {
  for (const [model, rate] of Object.entries(PRICING)) {
    assert.ok(rate.input > 0, `${model} has no input rate`);
    assert.ok(rate.output > 0, `${model} has no output rate`);
    assert.ok(rate.output >= rate.input, `${model}: output should cost at least input`);
  }
});

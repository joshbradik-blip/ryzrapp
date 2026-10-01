import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPer100, normalizeQuery, pickBestFood, scoreCandidate, type FdcFood } from './usdaMatch';

const nutrients = (kcal: number | null, p: number, c: number, f: number) => [
  ...(kcal == null ? [] : [{ nutrientId: 1008, nutrientNumber: '208', unitName: 'KCAL', value: kcal }]),
  { nutrientId: 1003, nutrientNumber: '203', unitName: 'G', value: p },
  { nutrientId: 1005, nutrientNumber: '205', unitName: 'G', value: c },
  { nutrientId: 1004, nutrientNumber: '204', unitName: 'G', value: f },
];

const food = (fdcId: number, description: string, dataType: string, n = nutrients(100, 10, 10, 2)): FdcFood => ({
  fdcId, description, dataType, foodNutrients: n,
});

test('normalizeQuery lowercases, strips punctuation, caps length', () => {
  assert.equal(normalizeQuery('  Chicken Breast,  COOKED! '), 'chicken breast cooked');
  assert.equal(normalizeQuery('x'.repeat(300)).length, 100);
});

test('extractPer100 reads kcal + macros', () => {
  assert.deepEqual(extractPer100(food(1, 'x', 'SR Legacy', nutrients(165, 31, 0, 3.6))), {
    calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6,
  });
});

test('extractPer100 falls back to Atwater energy (957) when 208 is missing', () => {
  const f = food(1, 'x', 'Foundation', [
    ...nutrients(null, 20, 0, 5),
    { nutrientId: 2047, nutrientNumber: '957', unitName: 'KCAL', value: 130 },
  ]);
  assert.equal(extractPer100(f)?.calories, 130);
});

test('extractPer100 derives kcal from macros when no energy row exists, null when macros missing', () => {
  assert.equal(extractPer100(food(1, 'x', 'Foundation', nutrients(null, 10, 10, 10)))?.calories, 170);
  assert.equal(extractPer100({ fdcId: 1, description: 'x', foodNutrients: [{ nutrientNumber: '203', value: 5 }] }), null);
});

test('cooked query prefers the cooked entry over raw', () => {
  const foods = [
    food(1, 'Chicken, broilers or fryers, breast, meat only, raw', 'SR Legacy', nutrients(120, 22.5, 0, 2.6)),
    food(2, 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', 'SR Legacy', nutrients(165, 31, 0, 3.6)),
  ];
  assert.equal(pickBestFood('chicken breast cooked', 'cooked', foods)?.fdcId, 2);
  assert.equal(pickBestFood('chicken breast raw', 'raw', foods)?.fdcId, 1);
});

test('prefers concise generic entry over a long specific one', () => {
  const foods = [
    food(1, 'Rice, white, long-grain, regular, enriched, cooked', 'SR Legacy', nutrients(130, 2.7, 28, 0.3)),
    food(2, 'Rice, white, cooked, with butter, restaurant style, extra long grain', 'Survey (FNDDS)', nutrients(160, 3, 28, 4)),
  ];
  assert.equal(pickBestFood('white rice', 'cooked', foods)?.fdcId, 1);
});

test('plural / singular query words still match', () => {
  const foods = [food(1, 'Egg, whole, cooked, hard-boiled', 'SR Legacy', nutrients(155, 13, 1.1, 11))];
  assert.equal(pickBestFood('eggs hard boiled', 'cooked', foods)?.fdcId, 1);
});

test('returns null when too few query words match (caller falls back to the model)', () => {
  const foods = [food(1, 'Beef, ground, 80% lean, cooked', 'SR Legacy')];
  assert.equal(pickBestFood('pad thai noodles shrimp', 'prepared', foods), null);
  assert.equal(scoreCandidate('pad thai', 'prepared', foods[0]), null);
});

test('skips candidates without usable nutrients and returns null for empty input', () => {
  const broken: FdcFood = { fdcId: 9, description: 'Chicken breast cooked', dataType: 'SR Legacy', foodNutrients: [] };
  assert.equal(pickBestFood('chicken breast', 'cooked', [broken]), null);
  assert.equal(pickBestFood('chicken breast', 'cooked', []), null);
});

test('zero-calorie foods are valid matches', () => {
  const foods = [food(1, 'Coffee, brewed, prepared with tap water', 'SR Legacy', nutrients(1, 0.1, 0, 0))];
  assert.equal(pickBestFood('black coffee brewed', 'prepared', foods)?.per100.calories, 1);
});

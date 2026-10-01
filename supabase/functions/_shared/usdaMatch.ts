// Pure matching logic for the usda-lookup edge function: turn a USDA
// FoodData Central search response into per-100g nutrition for the best
// matching food. No Deno/RN imports so it is unit-tested under node
// (`npm run test:usda`).

export type FoodState = 'cooked' | 'raw' | 'prepared';

export interface Per100 {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface FdcNutrient {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
}

export interface FdcFood {
  fdcId: number;
  description: string;
  dataType?: string;
  score?: number;
  foodNutrients?: FdcNutrient[];
}

export interface UsdaMatch {
  fdcId: number;
  description: string;
  dataType: string;
  per100: Per100;
}

/** Curated datasets only — Branded has thousands of near-duplicate, inconsistent entries. */
export const FDC_DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];

const COOK_WORDS = new Set([
  'cooked', 'roasted', 'grilled', 'broiled', 'baked', 'boiled', 'steamed', 'fried',
  'sauteed', 'stewed', 'braised', 'toasted', 'poached', 'microwaved', 'pan-fried',
  'stir-fried', 'simmered', 'canned',
]);
const STOPWORDS = new Set(['a', 'an', 'and', 'of', 'the', 'with', 'in', 'on', 'or', 'without', 'plain']);
// Words the model adds for state; they steer ranking but should not count as
// required name tokens when measuring coverage.
const STATE_WORDS = new Set(['raw', ...COOK_WORDS]);

/** Cache key / matching normalization: lowercase, alphanumerics + spaces only. */
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function stem(t: string): string {
  if (t.length > 4 && t.endsWith('ies')) return t.slice(0, -3) + 'y';
  if (t.length > 3 && t.endsWith('es') && /(ch|sh|x|s|o)es$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function tokens(s: string): string[] {
  return normalizeQuery(s)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map(stem);
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Per-100g calories + macros from a FDC food. Energy is nutrient 208 (kcal);
 * Foundation foods often report Atwater energy (957/958) instead. When no
 * kcal figure exists it is derived from the macros. Returns null when the
 * macros themselves are missing.
 */
export function extractPer100(food: FdcFood): Per100 | null {
  const byNumber = new Map<string, FdcNutrient>();
  for (const n of food.foodNutrients ?? []) {
    const key = n.nutrientNumber ?? (n.nutrientId != null ? String(n.nutrientId) : '');
    if (key) byNumber.set(key, n);
    // Search results key some nutrients by their id (1003/1004/1005/1008) rather than number.
    if (n.nutrientId != null) byNumber.set(`id:${n.nutrientId}`, n);
  }
  const get = (number: string, id: number): number | null => {
    const n = byNumber.get(number) ?? byNumber.get(`id:${id}`);
    return n ? num(n.value) : null;
  };

  const protein = get('203', 1003);
  const fat = get('204', 1004);
  const carbs = get('205', 1005);
  if (protein == null || fat == null || carbs == null) return null;

  let kcal = get('208', 1008);
  if (kcal == null) {
    // Atwater general / specific factors (Foundation foods), kcal rows only.
    for (const [num_, id] of [['957', 2047], ['958', 2048]] as const) {
      const n = byNumber.get(num_) ?? byNumber.get(`id:${id}`);
      if (n && (n.unitName ?? 'KCAL').toUpperCase() === 'KCAL' && num(n.value) != null) {
        kcal = num(n.value);
        break;
      }
    }
  }
  if (kcal == null) kcal = protein * 4 + carbs * 4 + fat * 9;

  const r = (x: number) => Math.round(x * 10) / 10;
  return {
    calories: r(Math.max(0, kcal)),
    protein_g: r(Math.max(0, protein)),
    carbs_g: r(Math.max(0, carbs)),
    fat_g: r(Math.max(0, fat)),
  };
}

const MIN_COVERAGE = 0.6;

/**
 * Scores how well a FDC description matches the model's food query. Returns
 * null when too few of the query's name words appear (a bad match is worse
 * than the model's own estimate, which the caller falls back to).
 */
export function scoreCandidate(query: string, state: FoodState, food: FdcFood): number | null {
  const qTokens = [...new Set(tokens(query))];
  const nameTokens = qTokens.filter((t) => !STOPWORDS.has(t) && !STATE_WORDS.has(t));
  if (nameTokens.length === 0) return null;

  const dTokens = tokens(food.description);
  const dSet = new Set(dTokens);
  const covered = nameTokens.filter((t) => dSet.has(t)).length;
  const coverage = covered / nameTokens.length;
  if (coverage < MIN_COVERAGE) return null;

  let score = coverage * 10;

  // Prefer concise, generic entries over long, specific ones.
  const extra = dTokens.filter((t) => !qTokens.includes(t) && !STOPWORDS.has(t)).length;
  score -= Math.min(extra, 12) * 0.25;

  const hasRaw = dSet.has('raw');
  const hasCook = dTokens.some((t) => COOK_WORDS.has(t));
  if (state === 'cooked') {
    if (hasCook) score += 3;
    if (hasRaw) score -= 4;
  } else if (state === 'raw') {
    if (hasRaw) score += 3;
    if (hasCook) score -= 4;
  }

  // Curated generic datasets over survey recipes for single foods; survey
  // entries stay competitive for mixed dishes where nothing else matches.
  if (food.dataType === 'Foundation') score += 1;
  else if (food.dataType === 'SR Legacy') score += 0.75;

  // Tiebreak on USDA's own relevance (small weight).
  if (typeof food.score === 'number') score += Math.min(food.score, 1000) / 5000;
  return score;
}

/** Picks the best FDC match for a model-supplied query, or null if none is good enough. */
export function pickBestFood(query: string, state: FoodState, foods: FdcFood[]): UsdaMatch | null {
  let best: { food: FdcFood; per100: Per100; score: number } | null = null;
  for (const food of foods) {
    const per100 = extractPer100(food);
    if (!per100) continue;
    const score = scoreCandidate(query, state, food);
    if (score == null) continue;
    if (!best || score > best.score) best = { food, per100, score };
  }
  return best
    ? {
        fdcId: best.food.fdcId,
        description: best.food.description,
        dataType: best.food.dataType ?? 'Unknown',
        per100: best.per100,
      }
    : null;
}

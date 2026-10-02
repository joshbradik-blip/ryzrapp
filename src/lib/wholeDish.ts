// Whole-dish photo mode: pure helpers (no React Native / Supabase imports so
// they can be unit tested with `npm run test:photo`).
//
// A photo alone can't show absolute size, so the user lays a known object next
// to the food and tells us which one. We pass its real dimensions to the model
// as the scale for the ENTIRE dish (a whole pizza, a full cake tray...) instead
// of letting it default to one serving.

export type ReferenceObject = 'credit_card' | 'ruler' | 'fork' | 'coin';

export const REFERENCE_OBJECTS: Record<ReferenceObject, { label: string; description: string }> = {
  credit_card: { label: 'Credit card', description: 'a standard credit/debit card (85.6 mm x 54 mm, 3.37 in x 2.13 in)' },
  ruler: { label: 'Ruler', description: 'a ruler lying flat beside the food (read its markings: 30 cm / 12 in if a standard ruler)' },
  fork: { label: 'Fork', description: 'a standard dinner fork (about 19 cm / 7.5 in long)' },
  coin: { label: 'US quarter', description: 'a US quarter coin (24.3 mm / 0.955 in across)' },
};

export const REFERENCE_ORDER: ReferenceObject[] = ['credit_card', 'ruler', 'fork', 'coin'];

export const MAX_SERVINGS = 64;
/** Whole dishes (a large pizza, a sheet cake) weigh far more than a single plate. */
export const MAX_DISH_GRAMS = 8000;

/** Extra prompt block appended to the base photo prompt in whole-dish mode. */
export function wholeDishPromptAddendum(reference: ReferenceObject): string {
  const ref = REFERENCE_OBJECTS[reference];
  return `

WHOLE-DISH MODE: the user wants the ENTIRE dish, not one serving.
- Scale reference: the photo contains ${ref.description}. Use its real size to work out the real dimensions of the dish (diameter, length, thickness), then estimate the weight of the WHOLE dish. Prefer this over the plate-size cues above.
- "grams" is the weight of the whole dish as shown (e.g. every slice of a pizza, the full tray), never a single slice or portion.
- Add "servings": the natural number of portions the dish divides into (pizza slices as cut or typical for its size, cake wedges, tray squares). Use 1 if it is not divisible.
- If the reference object is NOT visible or not usable, still estimate the whole dish but set confidence to "low".`;
}

/** Reads the model's "servings" field: whole number, 1..MAX_SERVINGS, default 1. */
export function coerceServings(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(MAX_SERVINGS, n);
}

/** Share of a whole dish eaten, as a 0..1 fraction. `eaten` is clamped to [0, servings]. */
export function servingFraction(servings: number, eaten: number): number {
  const total = Math.max(1, servings);
  return Math.min(total, Math.max(0, eaten)) / total;
}

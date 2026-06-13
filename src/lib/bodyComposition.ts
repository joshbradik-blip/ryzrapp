// US Navy body-fat estimate from tape measurements (all lengths in cm).
// ~±3% vs DEXA — the standard free tape-measure method.
// Returns null when inputs are missing or out of the formula's valid range.
export function navyBodyFat(params: {
  sex: 'male' | 'female';
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number | null;
}): number | null {
  const { sex, heightCm, neckCm, waistCm, hipCm } = params;
  if (!heightCm || !neckCm || !waistCm) return null;

  let bf: number;
  if (sex === 'female') {
    if (!hipCm) return null;
    const inner = waistCm + hipCm - neckCm;
    if (inner <= 0) return null;
    bf = 495 / (1.29579 - 0.35004 * Math.log10(inner) + 0.221 * Math.log10(heightCm)) - 450;
  } else {
    const inner = waistCm - neckCm;
    if (inner <= 0) return null;
    bf = 495 / (1.0324 - 0.19077 * Math.log10(inner) + 0.15456 * Math.log10(heightCm)) - 450;
  }

  if (!isFinite(bf)) return null;
  return Math.max(3, Math.min(60, Math.round(bf * 10) / 10));
}

const CM_PER_IN = 2.54;
export const cmToIn = (cm: number) => Math.round((cm / CM_PER_IN) * 10) / 10;
export const inToCm = (inches: number) => Math.round(inches * CM_PER_IN * 10) / 10;

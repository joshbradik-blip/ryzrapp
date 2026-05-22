export type WeightUnit = 'kg' | 'lbs';

const KG_TO_LBS = 2.20462;

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  const val = unit === 'lbs' ? kg * KG_TO_LBS : kg;
  return Math.round(val * 10) / 10;
}

export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === 'lbs' ? value / KG_TO_LBS : value;
}

export function weightLabel(unit: WeightUnit): string {
  return unit === 'lbs' ? 'lbs' : 'kg';
}

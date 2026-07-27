// Deterministic nutrition math — TDEE, goal-adjusted calorie targets, and
// macro splits. Kept pure (no I/O, no store access) so it's trivially
// testable and so the AI coach can narrate these numbers without computing
// them, mirroring the futureSelf.ts approach.

import { UserProfile, SchedulePrefs, Goal, NutritionTargets, NutritionEntry } from '../types';

/**
 * Mifflin-St Jeor basal metabolic rate (kcal/day). The current standard for
 * predictive BMR — more accurate than Harris-Benedict for modern populations.
 */
export function mifflinStJeorBMR(profile: Pick<UserProfile, 'sex' | 'weight_kg' | 'height_cm' | 'age'>): number {
  const { sex, weight_kg, height_cm, age } = profile;
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === 'female' ? base - 161 : base + 5;
}

/**
 * Activity multiplier applied to BMR. We don't collect a NEAT/lifestyle
 * activity level directly, so we approximate it from training frequency —
 * the one signal we do have. Deliberately conservative so targets don't
 * overshoot.
 */
export function activityFactor(daysPerWeek: number | null | undefined): number {
  const d = daysPerWeek ?? 3;
  if (d <= 1) return 1.2;   // sedentary
  if (d <= 3) return 1.375; // light
  if (d <= 5) return 1.55;  // moderate
  return 1.725;             // very active
}

/** Total daily energy expenditure (maintenance calories). */
export function estimateTDEE(profile: UserProfile, schedule: SchedulePrefs | null): number {
  return Math.round(mifflinStJeorBMR(profile) * activityFactor(schedule?.days_per_week));
}

// Goal → calorie adjustment as a fraction of TDEE, and protein target in g/kg.
const GOAL_TUNING: Record<string, { calorieAdj: number; proteinPerKg: number }> = {
  lose_fat:         { calorieAdj: -0.2, proteinPerKg: 2.0 },
  build_muscle:     { calorieAdj: 0.1,  proteinPerKg: 1.8 },
  general_fitness:  { calorieAdj: 0,    proteinPerKg: 1.6 },
  rehab:            { calorieAdj: 0,    proteinPerKg: 1.6 },
  specific_activity:{ calorieAdj: 0,    proteinPerKg: 1.7 },
};

/** Fat floor in g/kg bodyweight — keeps hormones/essential-fat covered. */
const FAT_PER_KG = 0.8;

/**
 * Derives daily calorie + macro targets from the user's profile, training
 * schedule, and primary goal. Protein and fat are anchored to bodyweight;
 * carbohydrate fills the remaining energy so the macros always reconcile to
 * the calorie target.
 */
export function deriveTargets(
  profile: UserProfile,
  schedule: SchedulePrefs | null,
  goals: Goal[]
): NutritionTargets {
  const tdee = estimateTDEE(profile, schedule);
  const tuning = GOAL_TUNING[goals[0]?.category ?? 'general_fitness'] ?? GOAL_TUNING.general_fitness;

  // Never prescribe below a safe floor even with an aggressive deficit goal.
  const floor = profile.sex === 'female' ? 1200 : 1500;
  const calories = Math.max(floor, Math.round(tdee * (1 + tuning.calorieAdj)));

  const protein_g = Math.round(tuning.proteinPerKg * profile.weight_kg);
  const fat_g = Math.round(FAT_PER_KG * profile.weight_kg);
  const carbCals = Math.max(0, calories - protein_g * 4 - fat_g * 9);
  const carbs_g = Math.round(carbCals / 4);

  return { calories, protein_g, carbs_g, fat_g };
}

export interface DailyTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

/** Sums a day's logged entries into calorie + macro totals. */
export function sumEntries(entries: NutritionEntry[]): DailyTotals {
  return entries.reduce<DailyTotals>(
    (acc, e) => ({
      calories: acc.calories + e.calories,
      protein_g: acc.protein_g + e.protein_g,
      carbs_g: acc.carbs_g + e.carbs_g,
      fat_g: acc.fat_g + e.fat_g,
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

export interface EnergyBalance {
  caloriesIn: number;
  caloriesOut: number;
  net: number; // in − out; negative = deficit, positive = surplus
  bmr: number;
  activeCalories: number | null; // from wearable; null when unavailable
  usedWearable: boolean;
}

/**
 * Energy in vs out for the day. When a wearable reported active calories we
 * use the real burn (BMR + active) — the thing an estimate-only tracker
 * can't do. Otherwise we fall back to the estimated TDEE.
 */
export function computeEnergyBalance(params: {
  profile: UserProfile;
  schedule: SchedulePrefs | null;
  caloriesIn: number;
  activeCalories: number | null;
}): EnergyBalance {
  const { profile, schedule, caloriesIn, activeCalories } = params;
  const bmr = Math.round(mifflinStJeorBMR(profile));
  const usedWearable = activeCalories != null;
  const caloriesOut = usedWearable
    ? bmr + Math.round(activeCalories as number)
    : estimateTDEE(profile, schedule);
  return {
    caloriesIn: Math.round(caloriesIn),
    caloriesOut,
    net: Math.round(caloriesIn) - caloriesOut,
    bmr,
    activeCalories: usedWearable ? Math.round(activeCalories as number) : null,
    usedWearable,
  };
}

/** Local calendar day as YYYY-MM-DD (not UTC — matches how meals are logged). */
export function localDayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

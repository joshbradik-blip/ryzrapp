// Platform-agnostic health-data interface.
//
// The app only ever talks to `Health.*`. A real native provider (Apple HealthKit
// / Android Health Connect) is registered at runtime via `setHealthProvider`,
// and ONLY when the native modules are actually present in the build — see
// docs/health-integration.md for how to enable it.
//
// Until a provider is registered, every call is a safe no-op (returns
// unavailable / null). That's what makes this a "guarded scaffold": it compiles
// and runs in builds that don't include the native health modules, so it can't
// disturb an in-flight App Store build.

export interface WeightSample {
  kg: number;
  date: string; // ISO timestamp of the measurement
}

export interface BodyCompSample {
  value: number;
  date: string; // ISO timestamp of the measurement
}

/** Body-composition readings from smart scales (Withings, Eufy, Garmin Index…). */
export interface BodyComposition {
  /** Body fat percentage, 0–100 scale. */
  bodyFatPct: BodyCompSample | null;
  leanMassKg: BodyCompSample | null;
}

/**
 * One local calendar day of wearable metrics. Any field the device/user
 * doesn't track is null — consumers must treat every field as optional.
 */
export interface DailyHealthMetrics {
  date: string; // local calendar day, YYYY-MM-DD
  steps: number | null;
  restingHr: number | null; // bpm
  /** HR variability in ms (SDNN on iOS, RMSSD on Android — comparable trends, not absolute values). */
  hrvMs: number | null;
  sleepMinutes: number | null; // asleep time for the night ending this day
  activeCalories: number | null; // kcal
  distanceMeters: number | null; // walking + running
  exerciseMinutes: number | null;
}

export interface HealthProvider {
  /** True only on a build where the native health module is linked + the OS supports it. */
  isAvailable(): boolean;
  /** Prompt the OS health permission sheet. Resolves true if read access was granted. */
  requestPermissions(): Promise<boolean>;
  /** Step count since local midnight, or null if unavailable/denied. */
  getTodaySteps(): Promise<number | null>;
  /** Most recent body-mass sample in kg, or null. */
  getLatestWeightKg(): Promise<WeightSample | null>;
  /** Most recent body-fat % and lean-mass samples (smart scales), nulls when absent. */
  getLatestBodyComposition(): Promise<BodyComposition>;
  /** Per-day metrics for the trailing `days` local calendar days, oldest first (today included). */
  getDailyMetrics(days: number): Promise<DailyHealthMetrics[]>;
}

let provider: HealthProvider | null = null;

/** Called once at startup by the native enable shim (healthProvider.ts). */
export function setHealthProvider(p: HealthProvider | null): void {
  provider = p;
}

const EMPTY_BODY_COMP: BodyComposition = { bodyFatPct: null, leanMassKg: null };

export const Health = {
  isAvailable: (): boolean => provider?.isAvailable() ?? false,
  requestPermissions: (): Promise<boolean> =>
    provider?.requestPermissions() ?? Promise.resolve(false),
  getTodaySteps: (): Promise<number | null> =>
    provider?.getTodaySteps() ?? Promise.resolve(null),
  getLatestWeightKg: (): Promise<WeightSample | null> =>
    provider?.getLatestWeightKg() ?? Promise.resolve(null),
  getLatestBodyComposition: (): Promise<BodyComposition> =>
    provider?.getLatestBodyComposition() ?? Promise.resolve(EMPTY_BODY_COMP),
  getDailyMetrics: (days: number): Promise<DailyHealthMetrics[]> =>
    provider?.getDailyMetrics(days) ?? Promise.resolve([]),
};

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
  /** Walking + running distance. iOS only — not read from Health Connect. */
  distanceMeters: number | null;
}

/**
 * Why a permission request ended the way it did. A bare boolean can't tell
 * "you declined" from "Health Connect isn't installed" from "the OS refused to
 * show the prompt again" — and the caller needs that distinction to offer a way
 * out instead of looping on the same dead-end alert.
 */
export type HealthPermissionResult =
  /** Read access is available. */
  | 'granted'
  /** Declined, or the OS suppressed the prompt after repeated requests. */
  | 'denied'
  /** No health provider on this device at all. */
  | 'unavailable'
  /** Health Connect is missing or too old and must be installed/updated. */
  | 'provider_update_required';

export interface HealthProvider {
  /** True only on a build where the native health module is linked + the OS supports it. */
  isAvailable(): boolean;
  /** Prompt the OS health permission sheet. */
  requestPermissions(): Promise<HealthPermissionResult>;
  /** Open the OS health settings so the user can grant access by hand. */
  openSettings(): void;
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
  requestPermissions: (): Promise<HealthPermissionResult> =>
    provider?.requestPermissions() ?? Promise.resolve('unavailable'),
  openSettings: (): void => provider?.openSettings(),
  getTodaySteps: (): Promise<number | null> =>
    provider?.getTodaySteps() ?? Promise.resolve(null),
  getLatestWeightKg: (): Promise<WeightSample | null> =>
    provider?.getLatestWeightKg() ?? Promise.resolve(null),
  getLatestBodyComposition: (): Promise<BodyComposition> =>
    provider?.getLatestBodyComposition() ?? Promise.resolve(EMPTY_BODY_COMP),
  getDailyMetrics: (days: number): Promise<DailyHealthMetrics[]> =>
    provider?.getDailyMetrics(days) ?? Promise.resolve([]),
};

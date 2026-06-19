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

export interface HealthProvider {
  /** True only on a build where the native health module is linked + the OS supports it. */
  isAvailable(): boolean;
  /** Prompt the OS health permission sheet. Resolves true if read access was granted. */
  requestPermissions(): Promise<boolean>;
  /** Step count since local midnight, or null if unavailable/denied. */
  getTodaySteps(): Promise<number | null>;
  /** Most recent body-mass sample in kg, or null. */
  getLatestWeightKg(): Promise<WeightSample | null>;
}

let provider: HealthProvider | null = null;

/** Called once at startup by the native enable shim (healthProvider.ts). */
export function setHealthProvider(p: HealthProvider | null): void {
  provider = p;
}

export const Health = {
  isAvailable: (): boolean => provider?.isAvailable() ?? false,
  requestPermissions: (): Promise<boolean> =>
    provider?.requestPermissions() ?? Promise.resolve(false),
  getTodaySteps: (): Promise<number | null> =>
    provider?.getTodaySteps() ?? Promise.resolve(null),
  getLatestWeightKg: (): Promise<WeightSample | null> =>
    provider?.getLatestWeightKg() ?? Promise.resolve(null),
};

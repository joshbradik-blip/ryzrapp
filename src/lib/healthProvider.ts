// ─────────────────────────────────────────────────────────────────────────────
// NATIVE HEALTH PROVIDER — Apple HealthKit (iOS) + Health Connect (Android).
//
// Enabled by calling `enableHealthSync()` once at startup (App.tsx). The native
// modules are loaded lazily via require() *inside* the factories and wrapped in
// try/catch, so importing this file is side-effect free and merely calling
// enableHealthSync() before a native rebuild can't crash the app — it just
// leaves the no-op provider in place. `import type` is erased at compile time,
// so it adds no runtime import while still giving full type-checking.
//
// Reads only. Every metric below maps to a feature the user can see — Google
// Play's Health Connect policy rejects any permission that doesn't, so don't
// add a read here without a screen that renders it.
//
//   steps, active calories  → energy balance + activity records
//   resting HR, HRV, sleep  → recovery-readiness score (src/lib/readiness.ts)
//   body mass, body fat %   → body composition + Future Self projection
//   lean mass, distance     → iOS only; not declared on Health Connect
//
// See docs/health-integration.md.
// ─────────────────────────────────────────────────────────────────────────────
import { Linking, Platform } from 'react-native';
import {
  BodyComposition,
  DailyHealthMetrics,
  HealthProvider,
  WeightSample,
  setHealthProvider,
} from './health';
import type * as HealthKit from '@kingstinct/react-native-healthkit';
import type * as HealthConnect from 'react-native-health-connect';

function startOfDay(daysAgo: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyDay(date: string): DailyHealthMetrics {
  return {
    date,
    steps: null,
    restingHr: null,
    hrvMs: null,
    sleepMinutes: null,
    activeCalories: null,
    distanceMeters: null,
  };
}

// ── iOS: Apple HealthKit via @kingstinct/react-native-healthkit ──────────────
function createHealthKitProvider(): HealthProvider {
  const HK = require('@kingstinct/react-native-healthkit') as typeof HealthKit;

  const daySum = async (
    id: Parameters<typeof HK.queryStatisticsForQuantity>[0],
    unit: string,
    start: Date,
    end: Date,
  ): Promise<number | null> => {
    try {
      const res = await HK.queryStatisticsForQuantity(id, ['cumulativeSum'], {
        filter: { date: { startDate: start, endDate: end } },
        unit,
      });
      const sum = res.sumQuantity?.quantity;
      return typeof sum === 'number' ? sum : null;
    } catch {
      return null;
    }
  };

  const dayAvg = async (
    id: Parameters<typeof HK.queryStatisticsForQuantity>[0],
    unit: string,
    start: Date,
    end: Date,
  ): Promise<number | null> => {
    try {
      const res = await HK.queryStatisticsForQuantity(id, ['discreteAverage'], {
        filter: { date: { startDate: start, endDate: end } },
        unit,
      });
      const avg = res.averageQuantity?.quantity;
      return typeof avg === 'number' ? avg : null;
    } catch {
      return null;
    }
  };

  // Minutes asleep for samples overlapping [start, end). inBed (0) and awake (2)
  // don't count; asleep/core/deep/REM do.
  const sleepMinutes = async (start: Date, end: Date): Promise<number | null> => {
    try {
      const samples = await HK.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
        filter: { date: { startDate: start, endDate: end } },
        limit: 0,
      });
      let ms = 0;
      for (const s of samples) {
        const v = s.value as number;
        if (v === 0 || v === 2) continue;
        ms += new Date(s.endDate).getTime() - new Date(s.startDate).getTime();
      }
      return samples.length > 0 ? Math.round(ms / 60000) : null;
    } catch {
      return null;
    }
  };

  return {
    isAvailable: () => {
      try { return HK.isHealthDataAvailable(); } catch { return false; }
    },
    openSettings: () => {
      // HealthKit grants are managed in Settings → Health → Data Access, which
      // has no direct deep link; the app's own settings page is the closest.
      Linking.openSettings().catch(() => {});
    },
    requestPermissions: async () => {
      try {
        // HealthKit never reveals read-grant status (privacy); resolves true once
        // the sheet completes. We surface "no data" downstream if reads come back empty.
        const ok = await HK.requestAuthorization({
          toRead: [
            'HKQuantityTypeIdentifierStepCount',
            'HKQuantityTypeIdentifierBodyMass',
            'HKQuantityTypeIdentifierBodyFatPercentage',
            'HKQuantityTypeIdentifierLeanBodyMass',
            'HKQuantityTypeIdentifierRestingHeartRate',
            'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
            'HKQuantityTypeIdentifierActiveEnergyBurned',
            'HKQuantityTypeIdentifierDistanceWalkingRunning',
            'HKCategoryTypeIdentifierSleepAnalysis',
          ],
        });
        return ok ? 'granted' : 'denied';
      } catch (e) {
        // Don't swallow this silently — a rejection here means the sheet never
        // presented (e.g. raised while another view controller was still being
        // dismissed), which is indistinguishable from a denial at the call site.
        console.warn('[health] HealthKit requestAuthorization failed:', e);
        return 'denied';
      }
    },
    getTodaySteps: async () => {
      const sum = await daySum('HKQuantityTypeIdentifierStepCount', 'count', startOfDay(0), new Date());
      return sum != null ? Math.round(sum) : null;
    },
    getLatestWeightKg: async () => {
      try {
        const s = await HK.getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyMass', 'kg');
        if (!s) return null;
        return { kg: s.quantity, date: s.endDate.toISOString() } as WeightSample;
      } catch {
        return null;
      }
    },
    getLatestBodyComposition: async () => {
      const out: BodyComposition = { bodyFatPct: null, leanMassKg: null };
      try {
        const bf = await HK.getMostRecentQuantitySample('HKQuantityTypeIdentifierBodyFatPercentage', '%');
        if (bf) {
          // HealthKit percent unit is a 0–1 fraction.
          const pct = bf.quantity <= 1 ? bf.quantity * 100 : bf.quantity;
          out.bodyFatPct = { value: Math.round(pct * 10) / 10, date: bf.endDate.toISOString() };
        }
      } catch {}
      try {
        const lm = await HK.getMostRecentQuantitySample('HKQuantityTypeIdentifierLeanBodyMass', 'kg');
        if (lm) out.leanMassKg = { value: Math.round(lm.quantity * 10) / 10, date: lm.endDate.toISOString() };
      } catch {}
      return out;
    },
    getDailyMetrics: async (days: number) => {
      const out: DailyHealthMetrics[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const start = startOfDay(i);
        const end = i === 0 ? new Date() : startOfDay(i - 1);
        const day = emptyDay(localDateKey(start));
        const [steps, activeCal, distance, restingHr, hrv, sleep] = await Promise.all([
          daySum('HKQuantityTypeIdentifierStepCount', 'count', start, end),
          daySum('HKQuantityTypeIdentifierActiveEnergyBurned', 'kcal', start, end),
          daySum('HKQuantityTypeIdentifierDistanceWalkingRunning', 'm', start, end),
          dayAvg('HKQuantityTypeIdentifierRestingHeartRate', 'count/min', start, end),
          dayAvg('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', 'ms', start, end),
          sleepMinutes(start, end),
        ]);
        day.steps = steps != null ? Math.round(steps) : null;
        day.activeCalories = activeCal != null ? Math.round(activeCal) : null;
        day.distanceMeters = distance != null ? Math.round(distance) : null;
        day.restingHr = restingHr != null ? Math.round(restingHr) : null;
        day.hrvMs = hrv != null ? Math.round(hrv * 10) / 10 : null;
        day.sleepMinutes = sleep;
        out.push(day);
      }
      return out;
    },
  };
}

// ── Android: Health Connect via react-native-health-connect ──────────────────
function createHealthConnectProvider(): HealthProvider {
  const HC = require('react-native-health-connect') as typeof HealthConnect;
  let ready = false;
  const ensureInit = async () => {
    if (!ready) ready = await HC.initialize();
    return ready;
  };

  const readRange = async <T extends Parameters<typeof HC.readRecords>[0]>(
    recordType: T,
    start: Date,
    end: Date,
  ) => {
    const { records } = await HC.readRecords(recordType, {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
    });
    return records;
  };

  return {
    isAvailable: () => true, // confirmed for real once initialize() runs
    openSettings: () => {
      try { HC.openHealthConnectSettings(); } catch {}
    },
    requestPermissions: async () => {
      try {
        // Health Connect ships as a separate app below Android 14. Check before
        // requesting, so "not installed" is reported as itself rather than
        // surfacing as a silent denial the user can't act on.
        const status = await HC.getSdkStatus();
        if (status === HC.SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'unavailable';
        if (status === HC.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
          return 'provider_update_required';
        }
        if (!(await ensureInit())) return 'unavailable';

        // Already granted? Health Connect resolves requestPermission with an
        // empty array when there is nothing new to grant, which is otherwise
        // indistinguishable from a refusal.
        if ((await HC.getGrantedPermissions()).length > 0) return 'granted';

        // Must stay in sync with android.permissions in app.json — requesting a
        // record type whose permission isn't declared throws, and declaring one
        // we never read is a Play policy violation ("excessive data access").
        //
        // Exactly one request per attempt. Health Connect rate-limits the
        // permission dialog and stops showing it after repeated asks; the old
        // code fired a second "fallback" request on every tap, burning that
        // budget twice as fast and leaving the prompt permanently suppressed.
        const granted = await HC.requestPermission([
          { accessType: 'read', recordType: 'Steps' },
          { accessType: 'read', recordType: 'Weight' },
          { accessType: 'read', recordType: 'BodyFat' },
          { accessType: 'read', recordType: 'RestingHeartRate' },
          { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
          { accessType: 'read', recordType: 'SleepSession' },
          { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
        ]);
        if (granted.length > 0) return 'granted';

        // The dialog may have been suppressed entirely — re-read the real state
        // rather than trusting an empty response.
        return (await HC.getGrantedPermissions()).length > 0 ? 'granted' : 'denied';
      } catch (e) {
        console.warn('[health] Health Connect permission request failed:', e);
        return 'denied';
      }
    },
    getTodaySteps: async () => {
      try {
        await ensureInit();
        const records = await readRange('Steps', startOfDay(0), new Date());
        return records.reduce((sum, r) => sum + r.count, 0);
      } catch {
        return null;
      }
    },
    getLatestWeightKg: async () => {
      try {
        await ensureInit();
        const records = await readRange('Weight', new Date(Date.now() - 365 * 86400000), new Date());
        const last = records[records.length - 1];
        if (!last) return null;
        return { kg: last.weight.inKilograms, date: last.time } as WeightSample;
      } catch {
        return null;
      }
    },
    getLatestBodyComposition: async () => {
      const out: BodyComposition = { bodyFatPct: null, leanMassKg: null };
      const yearAgo = new Date(Date.now() - 365 * 86400000);
      try {
        await ensureInit();
        const bf = await readRange('BodyFat', yearAgo, new Date());
        const lastBf = bf[bf.length - 1];
        if (lastBf) out.bodyFatPct = { value: Math.round(lastBf.percentage * 10) / 10, date: lastBf.time };
      } catch {}
      // Lean mass is iOS-only — READ_LEAN_BODY_MASS isn't declared on Android.
      return out;
    },
    getDailyMetrics: async (days: number) => {
      const byDate = new Map<string, DailyHealthMetrics>();
      for (let i = days - 1; i >= 0; i--) {
        const key = localDateKey(startOfDay(i));
        byDate.set(key, emptyDay(key));
      }
      const start = startOfDay(days - 1);
      const end = new Date();
      const dayOf = (iso: string) => byDate.get(localDateKey(new Date(iso)));

      try {
        await ensureInit();
      } catch {
        return [...byDate.values()];
      }

      // Each record type degrades independently — a denied permission or missing
      // data source must not blank out the other metrics.
      try {
        for (const r of await readRange('Steps', start, end)) {
          const d = dayOf(r.startTime);
          if (d) d.steps = (d.steps ?? 0) + r.count;
        }
      } catch {}
      try {
        for (const r of await readRange('ActiveCaloriesBurned', start, end)) {
          const d = dayOf(r.startTime);
          if (d) d.activeCalories = (d.activeCalories ?? 0) + r.energy.inKilocalories;
        }
      } catch {}
      // Distance is iOS-only — READ_DISTANCE isn't declared on Android.
      try {
        // Attribute a sleep session to the day it ended (the "night of" that morning).
        for (const r of await readRange('SleepSession', start, end)) {
          const d = dayOf(r.endTime);
          if (!d) continue;
          const mins = (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000;
          d.sleepMinutes = (d.sleepMinutes ?? 0) + mins;
        }
      } catch {}
      try {
        const rhrAgg = new Map<string, { sum: number; n: number }>();
        for (const r of await readRange('RestingHeartRate', start, end)) {
          const key = localDateKey(new Date(r.time));
          const cur = rhrAgg.get(key) ?? { sum: 0, n: 0 };
          rhrAgg.set(key, { sum: cur.sum + r.beatsPerMinute, n: cur.n + 1 });
        }
        for (const [key, { sum, n }] of rhrAgg) {
          const d = byDate.get(key);
          if (d) d.restingHr = Math.round(sum / n);
        }
      } catch {}
      try {
        const hrvAgg = new Map<string, { sum: number; n: number }>();
        for (const r of await readRange('HeartRateVariabilityRmssd', start, end)) {
          const key = localDateKey(new Date(r.time));
          const cur = hrvAgg.get(key) ?? { sum: 0, n: 0 };
          hrvAgg.set(key, { sum: cur.sum + r.heartRateVariabilityMillis, n: cur.n + 1 });
        }
        for (const [key, { sum, n }] of hrvAgg) {
          const d = byDate.get(key);
          if (d) d.hrvMs = Math.round((sum / n) * 10) / 10;
        }
      } catch {}

      return [...byDate.values()].map((d) => ({
        ...d,
        activeCalories: d.activeCalories != null ? Math.round(d.activeCalories) : null,
        distanceMeters: d.distanceMeters != null ? Math.round(d.distanceMeters) : null,
        sleepMinutes: d.sleepMinutes != null ? Math.round(d.sleepMinutes) : null,
      }));
    },
  };
}

/** Call once at app startup (after the native modules are installed + prebuilt). */
export function enableHealthSync(): void {
  try {
    setHealthProvider(Platform.OS === 'ios' ? createHealthKitProvider() : createHealthConnectProvider());
  } catch {
    // Native module not present (e.g. not prebuilt yet) — keep the no-op provider.
  }
}

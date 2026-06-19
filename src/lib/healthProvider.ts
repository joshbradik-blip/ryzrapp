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
// Reads only: step count + body mass. See docs/health-integration.md.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import { HealthProvider, WeightSample, setHealthProvider } from './health';
import type * as HealthKit from '@kingstinct/react-native-healthkit';
import type * as HealthConnect from 'react-native-health-connect';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── iOS: Apple HealthKit via @kingstinct/react-native-healthkit ──────────────
function createHealthKitProvider(): HealthProvider {
  const HK = require('@kingstinct/react-native-healthkit') as typeof HealthKit;

  return {
    isAvailable: () => {
      try { return HK.isHealthDataAvailable(); } catch { return false; }
    },
    requestPermissions: async () => {
      try {
        // HealthKit never reveals read-grant status (privacy); resolves true once
        // the sheet completes. We surface "no data" downstream if reads come back empty.
        return await HK.requestAuthorization({
          toRead: ['HKQuantityTypeIdentifierStepCount', 'HKQuantityTypeIdentifierBodyMass'],
        });
      } catch {
        return false;
      }
    },
    getTodaySteps: async () => {
      try {
        const res = await HK.queryStatisticsForQuantity(
          'HKQuantityTypeIdentifierStepCount',
          ['cumulativeSum'],
          { filter: { date: { startDate: startOfToday(), endDate: new Date() } } },
        );
        const sum = res.sumQuantity?.quantity;
        return typeof sum === 'number' ? Math.round(sum) : null;
      } catch {
        return null;
      }
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

  return {
    isAvailable: () => true, // confirmed for real once initialize() runs
    requestPermissions: async () => {
      try {
        await ensureInit();
        const granted = await HC.requestPermission([
          { accessType: 'read', recordType: 'Steps' },
          { accessType: 'read', recordType: 'Weight' },
        ]);
        return granted.length > 0;
      } catch {
        return false;
      }
    },
    getTodaySteps: async () => {
      try {
        await ensureInit();
        const { records } = await HC.readRecords('Steps', {
          timeRangeFilter: {
            operator: 'between',
            startTime: startOfToday().toISOString(),
            endTime: new Date().toISOString(),
          },
        });
        return records.reduce((sum, r) => sum + r.count, 0);
      } catch {
        return null;
      }
    },
    getLatestWeightKg: async () => {
      try {
        await ensureInit();
        const { records } = await HC.readRecords('Weight', {
          timeRangeFilter: {
            operator: 'between',
            startTime: new Date(Date.now() - 365 * 86400000).toISOString(),
            endTime: new Date().toISOString(),
          },
        });
        const last = records[records.length - 1];
        if (!last) return null;
        return { kg: last.weight.inKilograms, date: last.time } as WeightSample;
      } catch {
        return null;
      }
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

// ─────────────────────────────────────────────────────────────────────────────
// NATIVE HEALTH PROVIDER — Health Connect (Android).
//
// iOS HealthKit support was removed (App Store rejection, Guideline 2.5.1 —
// see docs/health-integration.md) and is pending a verified on-device rebuild
// before it's reintroduced. `enableHealthSync()` is a no-op on iOS (App.tsx).
//
// Enabled by calling `enableHealthSync()` once at startup (App.tsx). The native
// module is loaded lazily via require() *inside* the factory and wrapped in
// try/catch, so importing this file is side-effect free and merely calling
// enableHealthSync() before a native rebuild can't crash the app — it just
// leaves the no-op provider in place. `import type` is erased at compile time,
// so it adds no runtime import while still giving full type-checking.
//
// Reads only: step count + body mass. See docs/health-integration.md.
// ─────────────────────────────────────────────────────────────────────────────
import { Platform } from 'react-native';
import { HealthProvider, WeightSample, setHealthProvider } from './health';
import type * as HealthConnect from 'react-native-health-connect';

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
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

/** Call once at app startup (after the native module is installed + prebuilt). Android only. */
export function enableHealthSync(): void {
  if (Platform.OS === 'ios') return;
  try {
    setHealthProvider(createHealthConnectProvider());
  } catch {
    // Native module not present (e.g. not prebuilt yet) — keep the no-op provider.
  }
}

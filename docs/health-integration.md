# Health integration (Apple Health / Health Connect)

Status: **DISABLED on iOS (App Store rejection, Guideline 2.5.1, build 1.0.9/22) — Android Health Connect still enabled.**
Reads **step count + body weight** only.

Apple rejected the binary because it contained the HealthKit entitlement/framework
but the feature was never verified working on-device (the UI still showed "SOON").
Per Apple's guidance, references to a framework that isn't actually used should be
removed from the binary rather than just hidden in the UI. The `@kingstinct/react-native-healthkit`
plugin was removed from `app.json` and the `enableHealthSync()` call is now skipped
on iOS (see `App.tsx`) until this is rebuilt, tested on a real device, and re-enabled
deliberately for a future release.

## What's already done (this repo)
- `@kingstinct/react-native-healthkit` + `react-native-health-connect` installed
  (with `react-native-nitro-modules`).
- `app.json` plugins configured:
  - HealthKit: adds the `com.apple.developer.healthkit` entitlement +
    `NSHealthShareUsageDescription`. Write access and background delivery are
    **off** (read-only) via `NSHealthUpdateUsageDescription: false`, `background: false`.
  - Health Connect: adds the permissions-rationale intent filter; `READ_STEPS`
    and `READ_WEIGHT` added to `android.permissions`.
- `enableHealthSync()` is called once in `App.tsx`.
- Architecture: app talks only to `Health.*` (`src/lib/health.ts`); the native
  provider (`src/lib/healthProvider.ts`) is loaded lazily and guarded, so the app
  still runs (health simply unavailable) on a binary built before the prebuild.
- Every native API call is type-checked against the installed library types
  (`tsc` clean).

## What's left (must run on a build machine)
```sh
npx expo prebuild --clean
# iOS: build on macOS/Xcode or EAS; Android: build with Health Connect on device/emulator
```
Then on a real device:
1. Open **Profile → Wearables**. The hub card should now show **Connect** (not "SOON").
2. Tap Connect → the OS health permission sheet appears → allow steps + weight.
3. Confirm **Steps today** and **Latest weight** populate, and that a new weight
   reading shows up in **Progress → Body Weight** (auto-logged via `bodyStore`).

iOS notes:
- The HealthKit capability must be enabled on the App ID / provisioning profile
  (EAS handles this with the entitlement present; with manual signing, add the
  HealthKit capability in the Apple Developer portal).
- App Review will ask how you use health data — answer: read-only, to personalize
  training and track bodyweight progress. Don't claim write access (we don't write).

Health Connect (Android) notes:
- Requires the Health Connect app (built into Android 14+, otherwise a Play install).
- Google Play has a Health Connect declaration form for the health permissions.

## How to turn it back OFF
Remove the `enableHealthSync()` call in `App.tsx` (the no-op provider takes over),
or fully revert by removing the two plugins + permissions from `app.json`,
uninstalling the packages, and prebuilding again.

## Good next features once data flows
Recovery/readiness (HRV + resting HR + sleep) feeding AI-plan intensity; live HR
+ zones during a workout session; auto-import outside activity into streak/volume.

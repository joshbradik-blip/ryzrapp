# Health integration (Apple Health / Health Connect)

Status: **ENABLED in JS/config — pending a native rebuild + on-device test.**

Reads (all read-only, no writes):

| Metric | iOS (HealthKit) | Android (Health Connect) |
| --- | --- | --- |
| Steps | StepCount | Steps |
| Body weight | BodyMass | Weight |
| Body fat % | BodyFatPercentage | BodyFat |
| Lean mass | LeanBodyMass | LeanBodyMass |
| Resting heart rate | RestingHeartRate | RestingHeartRate |
| HR variability | HeartRateVariabilitySDNN | HeartRateVariabilityRmssd |
| Sleep | SleepAnalysis (asleep stages) | SleepSession |
| Active calories | ActiveEnergyBurned | ActiveCaloriesBurned |
| Distance | DistanceWalkingRunning | Distance |
| Exercise minutes | AppleExerciseTime | ExerciseSession duration |

Note: iOS HRV is SDNN, Android is RMSSD — trends are comparable, absolute values are not.

## How data flows

Apple Watch, Galaxy Watch (via Samsung Health), Fitbit, Garmin, WHOOP, Oura,
Strava, Polar, and smart scales all publish into the OS health hub. RYZR reads
the hub — one integration covers every major wearable, no per-brand OAuth needed.

```
watch/ring/scale/app ──▶ Apple Health / Health Connect ──▶ Health.* (src/lib/health.ts)
                                                              │
                          Supabase health_daily_metrics ◀── healthSync.ts (14-day upsert window)
                          Supabase body_measurements    ◀── auto-logged weight + body comp
                                                              │
                              wearablesStore ──▶ Wearables screen live tiles
                                             └─▶ Progress → Personal Records (activity records)
```

- `src/lib/health.ts` — platform-agnostic interface; safe no-op until a provider registers.
- `src/lib/healthProvider.ts` — HealthKit/Health Connect implementations, lazily
  required + guarded so un-prebuilt binaries keep running.
- `src/lib/healthSync.ts` — reads the trailing 14 days, upserts to Supabase
  `health_daily_metrics` (one row per user per day), derives wearable records
  (best step day, most active calories, longest sleep, lowest resting HR,
  longest distance day).
- `src/store/wearablesStore.ts` — connection prefs (persisted) + live snapshot,
  synced history, and derived records (session-scoped).
- New weight/body-fat/lean-mass scale readings are auto-logged into
  `body_measurements` with `source = 'apple_health' | 'health_connect'`.

## Database

Run `supabase/migrations/003_health_metrics.sql` **before shipping this build**:
it creates `health_daily_metrics` (with RLS + the `user_id,date` upsert key) and
adds `lean_mass_kg` + `source` to `body_measurements`. The client selects those
columns, so the migration must be applied first.

## What's left (must run on a build machine)
```sh
npx expo prebuild --clean
# iOS: build on macOS/Xcode or EAS; Android: build with Health Connect on device/emulator
```
Then on a real device:
1. Open **Profile → Wearables**. The hub card should now show **Connect** (not "SOON").
2. Tap Connect → the OS health permission sheet appears → allow the requested reads.
3. Confirm the live tiles populate (steps, active kcal, resting HR, sleep, weight, body fat).
4. Check **Progress → Personal Records** shows an **Activity** section after a sync.
5. Confirm a new weight reading shows up in **Progress → Body Weight** (auto-logged via `bodyStore`).

iOS notes:
- The HealthKit capability must be enabled on the App ID / provisioning profile
  (EAS handles this with the entitlement present; with manual signing, add the
  HealthKit capability in the Apple Developer portal).
- App Review will ask how you use health data — answer: read-only, to personalize
  training and track progress. Don't claim write access (we don't write).

Health Connect (Android) notes:
- Requires the Health Connect app (built into Android 14+, otherwise a Play install).
- Google Play has a Health Connect declaration form — it must list every
  `android.permission.health.READ_*` permission in app.json.
- Older Health Connect installs can reject newer record types; the provider
  falls back to requesting steps + weight only.

## How to turn it back OFF
Remove the `enableHealthSync()` call in `App.tsx` (the no-op provider takes over),
or fully revert by removing the two plugins + permissions from `app.json`,
uninstalling the packages, and prebuilding again.

## Good next features once data flows
- **Readiness-aware training**: feed resting HR + HRV + sleep into the AI plan
  prompt so hard days land when the user is recovered (premium).
- **Live heart rate + zones** during a workout session (Apple Watch / HC exercise route).
- **Auto-import outside workouts** (runs/rides from Strava, Garmin) into streak + volume.
- **Steps/activity goal tile** on the Today tab with a daily target.
- **Body-composition trend chart** (weight + body fat + lean mass over time) on Progress.
- **Recovery-based rest-timer suggestions** using HRV trend.

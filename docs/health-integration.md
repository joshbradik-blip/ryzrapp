# Health integration (Apple Health / Health Connect)

Status: **Android (Health Connect) confirmed working on a real device** — a
`health_daily_metrics` row set synced from `source = 'health_connect'` on
2026-07-20 (steps only; that device had no paired watch/scale, so the other
metrics simply had nothing to sync — each metric degrades independently, see
below). **iOS (HealthKit) is unverified** — no `source = 'apple_health'` rows
have ever landed in the table. Since app.json/eas.json don't commit native
`ios`/`android` projects, every EAS build runs a fresh `prebuild` from the
current config — so whichever build is actually submitted determines whether
this ships, not whatever the previous build did. Confirm on Profile →
Wearables ("Connect" = compiled in, "SOON" = it didn't link) before trusting a
release's wearable support, and test on iOS specifically since it has no
track record yet.

Reads (all read-only, no writes):

| Metric | iOS (HealthKit) | Android (Health Connect) | Feature it powers |
| --- | --- | --- | --- |
| Steps | StepCount | Steps | Activity tiles + best-step-day record |
| Body weight | BodyMass | Weight | Body-weight trend, auto-logged measurements |
| Body fat % | BodyFatPercentage | BodyFat | Body composition + Future Self projection |
| Resting heart rate | RestingHeartRate | RestingHeartRate | Readiness score (0.3) + lowest-RHR record |
| HR variability | HeartRateVariabilitySDNN | HeartRateVariabilityRmssd | Readiness score (0.4) |
| Sleep | SleepAnalysis (asleep stages) | SleepSession | Readiness score (0.3) + longest-sleep record |
| Active calories | ActiveEnergyBurned | ActiveCaloriesBurned | Energy balance card + most-active-kcal record |
| Lean mass | LeanBodyMass | **not read** | Lean-mass row on Progress (iOS only) |
| Distance | DistanceWalkingRunning | **not read** | Longest-distance-day record (iOS only) |

Note: iOS HRV is SDNN, Android is RMSSD — trends are comparable, absolute values are not.

### Health Connect permissions are policy-scoped — don't add speculatively

Google Play rejects any Health Connect permission that isn't visibly used
("Excessive data access for declared feature"). RYZR was rejected on 2026-08-06
for exactly this. The rules that follow from it:

- **Every declared permission must map to a row above with a real feature.**
  Reading a value and storing it is not enough — a reviewer has to be able to
  see it on a screen.
- `ExerciseSession` was removed because `exerciseMinutes` was synced but never
  rendered. `Distance` and `LeanBodyMass` were dropped on Android because each
  backed only a single line in a records list — too thin to defend.
- Adding a permission means updating **three** places in lockstep:
  `android.permissions` in `app.json`, the request list in
  `src/lib/healthProvider.ts`, and `ROWS` in
  `src/components/wearables/HealthDisclosureSheet.tsx` — plus re-submitting the
  Play Console Health Connect declaration. See
  `docs/health-connect-play-declaration.md`.

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

## Readiness-aware training (built)

`src/lib/readiness.ts` scores recovery 0–100 each morning against the user's own
trailing baseline: HRV vs baseline (weight 0.4), resting HR vs baseline (0.3),
sleep vs 8h target + baseline (0.3). Metrics renormalize over what the user
actually tracks; each needs ≥3 baseline days; null when there's no signal.
Levels: ≥70 high · 45–69 moderate · <45 low.

Where it flows:
- **Today tab** — `ReadinessCard` (score ring, level, factor chips) renders once
  wearable data exists. Free users see the score; the card notes AI adaptation
  is Premium.
- **Plan generation/regeneration** (`generateWorkoutPlan`) — the prompt gets a
  RECOVERY STATUS section; low readiness cuts workout 1's volume ~20% and caps
  RPE at 7, high readiness green-lights an assertive start.
- **In-workout challenges** (`generateExerciseChallenges`) — under-recovered
  days never get PR/new-weight challenges; technique + tempo instead.
- **Coach messages** — the `workout-coach` edge function (now versioned in this
  repo at `supabase/functions/workout-coach/`) receives a `readiness` line:
  daily encouragement acknowledges recovery state, and pre-workout challenges
  switch to "match last time with perfect form" on run-down days.

## Coach plan editing (chat tools)

The Ask Coach chat can now modify the plan directly (`src/lib/coachTools.ts`):
- `swap_exercise` — replace an exercise in any workout (persists via
  `swapForPlan`, same path as the Substitute screen)
- `add_exercise` — add a library exercise to any workout ("add this to
  Thursday", "make this my next exercise"), positioned `next` or `end`

Flow: CoachChatSheet keeps a raw Anthropic message history (text, images,
tool_use/tool_result blocks) and runs a bounded tool loop (max 3 rounds)
through the `workout-coach` function, which forwards tool definitions to
Claude (`claude-sonnet-4-6` for chat). Tool calls execute client-side against
`workoutStore`; the chat shows an action chip (✅ Swapped …) and the coach
confirms. Equipment photos ride the same path, so "what's this machine?" →
"add it to today" works in one conversation.

## Good next features once data flows
- **Live heart rate + zones** during a workout session (Apple Watch / HC exercise route).
- **Auto-import outside workouts** (runs/rides from Strava, Garmin) into streak + volume.
- **Steps/activity goal tile** on the Today tab with a daily target.
- **Body-composition trend chart** (weight + body fat + lean mass over time) on Progress.
- **Recovery-based rest-timer suggestions** using HRV trend.

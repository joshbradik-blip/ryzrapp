# Health Connect — Play Console declaration (resubmission)

Context: RYZR was rejected on 2026-08-06 for two Health Connect policy issues.
The code changes are done; this document is the text to paste into Play Console.
**Code changes alone will not clear the rejection** — the declaration form has to
be resubmitted, and issue #2 explicitly requires a demo video.

## What changed in the app

Removed three permissions entirely (declared but not backing a visible feature):

| Removed | Why |
| --- | --- |
| `READ_EXERCISE` (ExerciseSession) | `exerciseMinutes` was read and synced but never rendered on any screen. Genuinely unused. |
| `READ_DISTANCE` | Backed only one line in a records list. Dropped on Android. |
| `READ_LEAN_BODY_MASS` | Backed only one row on Progress. Dropped on Android. |

Remaining set — 7 permissions, each mapped to a screen:

```
READ_STEPS                     READ_SLEEP
READ_ACTIVE_CALORIES_BURNED    READ_WEIGHT
READ_RESTING_HEART_RATE        READ_BODY_FAT
READ_HEART_RATE_VARIABILITY
```

Also added: a prominent in-app disclosure shown before the Health Connect
permission prompt, listing each data type and what it powers, with a link to the
privacy policy (Profile → Wearables → "Connect Health Connect", and reachable any
time via "What health data does RYZR read?").

## Issue 1 — "Excessive data access for declared feature"

Resolved by the removals above. In the declaration form, make sure the listed
permissions match the manifest exactly — a leftover checkbox for a permission
you no longer request will re-trigger this.

## Issue 2 — "Insufficient Information to Determine App Functionality"

Google asked specifically about `ActiveCaloriesBurned`, `Distance`,
`HeartRateVariabilityRmssd`, and `LeanBodyMass`. Two of those are now removed.
Suggested text for the "how does your app use this data" field:

> RYZR is an AI strength-training app. It builds a personalized training plan and
> adjusts each day's workout intensity based on how recovered the user is.
>
> **HeartRateVariabilityRmssd, RestingHeartRate, SleepSession** — these three
> inputs compute a daily recovery-readiness score (0–100) shown on the Today tab.
> Each metric is compared against the user's own 30-day rolling baseline: HRV is
> weighted 40%, resting heart rate 30%, and sleep duration 30%. When the score is
> low, RYZR tells the user to reduce load and lowers the prescribed intensity of
> that day's session; when it is high, it green-lights heavier progression. This
> is the app's core differentiating feature and it cannot function without these
> three data types. Resting heart rate and sleep additionally power two personal
> records on the Progress tab ("Lowest resting HR", "Longest sleep").
>
> **ActiveCaloriesBurned** — combined with the user's calculated basal metabolic
> rate to produce total daily energy expenditure, which is displayed on the Today
> tab's energy-balance card as calories burned versus calories eaten. Without it
> the card falls back to an estimate from BMR alone, which is materially less
> accurate for users who train. Also drives the "Most active calories" record.
>
> **Steps** — shown as the daily activity tile on the Wearables screen and as the
> "Best step day" personal record on the Progress tab.
>
> **Weight and BodyFat** — plotted as the user's body-composition trend on the
> Progress tab, and used by the "Future Self" feature, which projects an
> estimated physique change from the user's current body-fat percentage and lean
> mass. Weight readings from a connected smart scale are logged automatically so
> the user does not have to enter them by hand.
>
> All access is read-only — RYZR never writes to or modifies Health Connect
> records. Health data is stored in the user's own RYZR account, is never sold,
> and is never shared with advertisers or any third party. The user can
> disconnect at any time from Profile → Wearables.

## Demo video

Required. Record on a device that has Health Connect populated with real data —
an empty Health Connect makes every tile read "—", which is very likely what
caused this rejection in the first place. Cover, in order:

1. Profile → Wearables → tap **Connect Health Connect**
2. The disclosure sheet listing each data type and its use, and the privacy policy link
3. The Health Connect system permission screen with the granted types visible
4. Back in RYZR — the live tiles populating (steps, active kcal, resting HR, sleep, weight, body fat)
5. Today tab → the **recovery-readiness card** showing the score and its HRV / resting HR / sleep factors
6. Today tab → the **energy-balance card** showing active calories in the burn total
7. Progress tab → body-composition trend and the wearable personal records

## Pre-submission checklist

- [ ] `npx expo prebuild --clean -p android` so the manifest regenerates from `app.json`
- [ ] Confirm the built manifest has exactly 7 `android.permission.health.*` entries
- [ ] Play Console declaration checkboxes match the manifest exactly
- [ ] Privacy policy URL is live and mentions health data specifically
- [ ] Demo video recorded with populated Health Connect data
- [ ] Verify 16 KB alignment on the release AAB before upload (see below)

## 16 KB page size

The current dependency set is compliant — all 29 arm64-v8a libraries in a local
build report `p_align >= 16384`, and `expo.useLegacyPackaging=false` is set in
`android/gradle.properties`. The Play Console warning is against a previously
uploaded bundle, not this codebase. To confirm on the actual release AAB before
upload, unzip it and check the `base/lib/arm64-v8a/*.so` entries with Android's
`check_elf_alignment.sh`, or in Play Console open the warning's detail arrow —
it names the specific offending libraries.

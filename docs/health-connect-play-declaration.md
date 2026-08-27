# Health Connect — Play Console declaration

Current state: **rejected again on 2026-08-27**, this time on a single data type.

> Health Connect by Android Permissions policy: Insufficient Information to
> Determine App Functionality for Health Connect
> …
> Please elaborate on why does your application requires read access to the
> requested data types: **ActiveCaloriesBurned**

The first rejection (2026-08-06) covered four data types and "excessive data
access"; two of those permissions were removed and that half is cleared. What is
left is one data type, and the cause is not a missing justification — there was
one in the form — it is that **the justification described a feature the app does
not have**.

## Why the resubmission failed

The text submitted for `READ_ACTIVE_CALORIES_BURNED` was:

> Used to help calculate the user's daily training load as part of RYZR's
> recovery-readiness score. Read-only; never written to or shared with third
> parties.

Active calories are **not** an input to the recovery-readiness score. That score
is computed in `src/lib/readiness.ts` from exactly three signals — HRV (weight
0.4), resting heart rate (0.3), sleep duration (0.3). There is no training-load
term and `activeCalories` is never read there.

What active calories actually drive:

| Where | Code |
| --- | --- |
| Today tab → **Energy Balance** card: burn = BMR + active kcal, against food logged | `src/lib/nutrition.ts` `computeEnergyBalance`, `src/components/nutrition/EnergyBalanceCard.tsx` |
| Profile → Wearables → **ACTIVE KCAL** tile | `src/screens/profile/WearablesScreen.tsx` |
| Progress tab → **"Most active calories"** personal record | `src/lib/healthSync.ts` `bestActiveCalories`, `src/screens/progress/ProgressScreen.tsx` |

So a reviewer went looking for a training-load feature inside the readiness
score, did not find one, and closed it out as "we could not sufficiently
understand your app's core functionality and how it uses the requested
permission." The in-app disclosure sheet
(`src/components/wearables/HealthDisclosureSheet.tsx`) has always described this
correctly — "powers the energy-balance card that compares calories burned
against calories eaten" — so the console form and the app were telling the
reviewer two different stories.

The fix is to make the declaration match the code, not to add more words.

## Second contributing cause — the feature was invisible on a fresh install

`TodayScreen` used to gate the Energy Balance card on `caloriesInToday > 0`. A
reviewer who installs RYZR, connects Health Connect and opens the Today tab logs
no food, so the one screen that visibly consumes active calories never rendered.
Everything they could see was a readiness card that (correctly) makes no use of
the data type they were asking about.

Changed: the card now renders as soon as **either** side has a real number —
food logged, or active calories synced from the wearable. With no food logged it
shows the burn only ("Burned so far today", `2,140 kcal`, "Burn = 1,680 resting
+ 460 active calories read from your wearable"), rather than a meaningless
deficit verdict. The permission's use is now on screen the moment Health Connect
is connected.

## Text to paste into the console

Play Console → Policy → App content → Health apps → Health data permissions →
Activity → **Active calories**. Replace the existing text entirely:

> RYZR is an AI strength-training app. Its nutrition feature compares the
> calories a user eats against the calories they actually burn, and
> ActiveCaloriesBurned is the "burn" half of that calculation.
>
> Specifically: RYZR computes the user's basal metabolic rate from the height,
> weight, age and sex in their profile (Mifflin–St Jeor), then adds the active
> calories read from Health Connect for the current day. The total is displayed
> on the app's Today tab in a card titled "Energy Balance", as two bars — "In
> (food)" against "Out (burn)" — with the resulting daily deficit or surplus
> shown underneath and interpreted against the user's stated goal (fat loss,
> muscle gain, or maintenance). The card explicitly shows the breakdown to the
> user: "Burn = 1,680 resting + 460 active calories read from your wearable."
>
> Without this permission the burn figure falls back to a static activity-level
> multiplier taken from the user's profile, which does not reflect what they
> actually did that day and is materially wrong for anyone who trains — a user
> who ran an extra 6 km sees the same estimated burn as a user who sat down all
> day. Reading real active calories is the only way the card can be accurate.
>
> The same value is also shown as a daily "ACTIVE KCAL" tile on the Wearables
> screen (Profile → Wearables), and as a "Most active calories" personal record
> on the Progress tab.
>
> Access is read-only — RYZR never writes to or modifies any Health Connect
> record. The data is stored in the user's own RYZR account, is never sold, and
> is never shared with advertisers or any other third party. Before the Health
> Connect permission prompt is shown, RYZR displays an in-app disclosure listing
> every data type it reads and what each one is used for, with a link to the
> privacy policy. The user can disconnect at any time from Profile → Wearables.

Do not mention recovery readiness or training load in this field. Those belong to
HRV, resting heart rate and sleep, and claiming them here is what caused the
rejection.

## Check the rest of the form while you are in there

Two things in the console are worth verifying, because a mismatch between the
form and the manifest re-triggers this same rejection:

1. **The screenshot shows "Activity — 4/4 permissions completed."** The manifest
   declares exactly two Activity-category permissions: `READ_STEPS` and
   `READ_ACTIVE_CALORIES_BURNED`. If the form still carries entries for
   `READ_DISTANCE` and `READ_EXERCISE` — removed from the app in the previous
   round — delete them. A declared permission the app no longer requests reads as
   an unexplained request.
2. **`READ_HEART_RATE`** is in `app.json` and is requested at runtime, but the
   previous version of this document listed only seven permissions and left it
   out. It needs its own justification under Vitals:

   > Samsung Health and several other Health Connect writers publish raw
   > HeartRate samples but never write a RestingHeartRate record. On those
   > devices RYZR derives the user's resting heart rate from the lowest
   > sustained HeartRate samples of the night, so that the recovery-readiness
   > score on the Today tab still works. Where a RestingHeartRate record does
   > exist it takes precedence and the raw samples are unused. Read-only.

The full declared set is 8 permissions, and every one maps to a row in the
in-app disclosure sheet:

```
READ_STEPS                     READ_SLEEP
READ_ACTIVE_CALORIES_BURNED    READ_WEIGHT
READ_RESTING_HEART_RATE        READ_BODY_FAT
READ_HEART_RATE_VARIABILITY    READ_HEART_RATE
```

## Store listing

Fix item 1 in the rejection is "update your app's description … to clearly and
accurately reflect its purpose and features." The Play store listing should say,
in the first two lines of the long description, that RYZR reads wearable data to
produce a daily recovery score and a calories-in-vs-out energy balance. A
reviewer reads the listing before opening the app; if the listing sells only "AI
workout plans", health permissions look unrelated to the product.

## Demo video

Record on a device whose Health Connect actually contains data — an empty Health
Connect makes every tile read "—", which is indistinguishable from a broken
integration. Cover, in order:

1. Profile → Wearables → **Connect Health Connect**
2. The disclosure sheet listing each data type and its use, and the privacy link
3. The Health Connect system permission screen with the types granted
4. Back in RYZR — tiles populating, **ACTIVE KCAL** among them
5. Today tab → **Energy Balance** card, reading out active calories in the burn line
6. Today tab → recovery-readiness card (HRV / resting HR / sleep)
7. Progress tab → "Most active calories" record and the body-composition trend

Step 5 is the one this rejection is about — hold on it long enough to read.

## Pre-submission checklist

- [ ] Active calories justification replaced with the text above
- [ ] Any Distance / Exercise entries removed from the console form
- [ ] `READ_HEART_RATE` justified under Vitals
- [ ] `npx expo prebuild --clean -p android`, then confirm the built manifest has
      exactly the 8 `android.permission.health.*` entries listed above
- [ ] Store listing long description mentions the wearable-driven features
- [ ] Privacy policy URL live and specific about health data
- [ ] Demo video recorded against populated Health Connect data
- [ ] `node scripts/check-16kb.mjs <path-to.aab>` passes (see below)

## 16 KB page size

Separate issue, separate cause — it is not related to Health Connect, but Play
will reject updates for it independently ("App updates with these issues will be
rejected", enforced 2025-10-31).

Android 15+ devices with 16 KB memory pages require every bundled `.so` to be
aligned to a 16384-byte boundary. Expo SDK 54 / React Native 0.81 build
16 KB-aligned by default, and this project keeps the default uncompressed
packaging, so the current dependency set is expected to pass. The Play Console
warning is raised against the **uploaded artifact**, so the only answer that
means anything is checking the AAB you are about to ship:

```
node scripts/check-16kb.mjs ~/Downloads/ryzr-release.aab
```

It unpacks the bundle, reads the ELF program headers of every native library and
reports the alignment of each, exiting non-zero if any `arm64-v8a` or `x86_64`
library is aligned below 16 KB. If something fails, the fix is almost always a
version bump of the offending dependency — the script prints the library path,
which names the module it came from. Play Console's own "View details" on the
warning also lists the specific offending libraries for the bundle it flagged.

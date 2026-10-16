# AdMob setup — going from test ads to real revenue

The post-workout interstitial (`src/lib/ads.ts`) is built and wired to RYZR's
real AdMob account. What is left is the build, the store disclosures, and
AdMob's own app verification (sections 4–5).

Nothing here can ship over OTA — `react-native-google-mobile-ads` is a native
module, so changes to it or to the App IDs need a new EAS build and a store
submission.

## 1. AdMob account — done

Publisher `pub-9219644602177199`. Two apps, each with one **Interstitial** ad
unit named `Post-workout` (eCPM floor: Google optimized, *All prices*):

| | App ID (`~`) → `app.json` | Ad unit ID (`/`) → `src/lib/ads.ts` |
| --- | --- | --- |
| iOS | `ca-app-pub-9219644602177199~5009250607` | `ca-app-pub-9219644602177199/3360952005` |
| Android | `ca-app-pub-9219644602177199~5393972991` | `ca-app-pub-9219644602177199/6603947036` |

The iOS app also has a second, unused interstitial unit (`…/1543192046`)
created by mistake; it is harmless and can be deleted in AdMob.

## 2. App IDs — done

Set in `app.json` under the `react-native-google-mobile-ads` plugin.

> Never put dummy text there. The Google Mobile Ads SDK validates the App ID
> during native initialization and **crashes the app on launch** if it is
> malformed.

`skAdNetworkItems` lists only `cstr6suwn9.skadnetwork` (Google's own). If you
later add mediation or want fuller iOS attribution, paste in Google's
published SKAdNetwork list.

## 3. Ad unit IDs — done

Constants in `src/lib/ads.ts`, not build env: they aren't secrets, and a value
set only at build time would be dropped by the next `eas update`. The
`EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS/_ANDROID` vars still override them if set.
Dev builds (`__DEV__`) always use `TestIds.INTERSTITIAL`, so testing never
requests a live ad — self-clicks on live ads can get the account suspended.

## 3b. app-ads.txt — published

`https://www.myryzr.com/app-ads.txt` serves the AdMob line. It lives in the
`joshbradik-blip/ryzr-privacy` repo (`myryzr-site/app-ads.txt`), on the
`claude/serene-rubin-5dvthb` branch that Netlify deploys. Both store listings
must give `https://www.myryzr.com` as the developer website, or AdMob can't
verify the apps.

## 4. Build and submit

`appVersionSource` is `local` with no auto-increment, and the
`runtimeVersion` policy is `appVersion` — so the version string *is* the OTA
runtime. This build already carries the bump to 1.0.21 / iOS 38 / Android 41,
because the ads SDK is a native addition that cannot reach installed 1.0.20
apps over the air.

Do not bump the version again for JS-only follow-up work; publish that with
`eas update --branch production` so it reaches every 1.0.21 install.

## 5. Store disclosures

Both stores need updating before review, since the app now collects an
advertising identifier:

- **App Store Connect → App Privacy**: declare *Identifiers → Device ID* used
  for *Third-Party Advertising*. ATT is already wired (`expo-tracking-transparency`,
  prompted in `src/lib/metaAds.ts`), and the usage string is in `app.json`.
- **Play Console → Data safety**: declare the advertising ID, and confirm the
  **Ads** declaration under *App content*.

No health, workout or wearable data is passed to the ad SDK — `src/lib/ads.ts`
requests a plain interstitial with no targeting payload, which is what keeps
this inside Apple guideline 5.1.3.

## Turning ads off without a build

`app_config.post_workout_ads_enabled` in Supabase is a live kill switch read
through `src/lib/featureFlags.ts`. Set it to `false` in the Table Editor and
every install stops showing ads on next launch.

## Behaviour, for reference

- Free users only — premium never sees an ad.
- One interstitial, only after tapping **Done** on a completed workout. Never
  mid-session.
- Skipped for a user's first 3 completed workouts (`FREE_WORKOUTS_BEFORE_ADS`).
- Skipped if the ad has not finished loading by the time Done is tapped; the
  user never waits on an ad.
- Preloaded when the workout-complete screen opens, so it has the summary-reading
  window to load.

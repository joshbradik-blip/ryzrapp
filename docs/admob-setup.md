# AdMob setup — going from test ads to real revenue

The post-workout interstitial (`src/lib/ads.ts`) is built, wired up and merged.
It currently earns nothing, because both halves of the AdMob configuration are
still placeholders. This is the checklist to finish it.

Nothing here can ship over OTA — `react-native-google-mobile-ads` is a native
module, so every change below needs a new EAS build and a store submission.

## 1. Create the AdMob account

1. Sign up at [admob.google.com](https://admob.google.com) with the Google
   account that should receive payouts. It links to AdSense as part of signup
   and asks for a postal address and tax/payment details.
2. Add two apps under **Apps → Add app**: RYZR iOS and RYZR Android. Each can
   be linked to its store listing now or later.
3. For each app, **Ad units → Add ad unit → Interstitial**. Name them something
   like `RYZR iOS post-workout` / `RYZR Android post-workout`.

That leaves you with four IDs, in two shapes that are easy to mix up:

| Shape | Name | Where it goes |
| --- | --- | --- |
| `ca-app-pub-…~…` (tilde) | **App ID**, one per app | `app.json` |
| `ca-app-pub-…/…` (slash) | **Ad unit ID**, one per unit | `.env` |

## 2. Swap the App IDs in `app.json`

Under the `react-native-google-mobile-ads` plugin, these two values are
currently **Google's public test App IDs** — not placeholders we invented:

```json
"androidAppId": "ca-app-pub-3940256099942544~3347511713",
"iosAppId":     "ca-app-pub-3940256099942544~1458002511",
```

Replace both with the real `~` IDs from step 1.

> Do not put dummy text here. The Google Mobile Ads SDK validates the App ID
> during native initialization and **crashes the app on launch** if it is
> malformed. Google's test IDs are the only safe stand-in, which is why they
> are still in place.

While you are in the plugin block, `skAdNetworkItems` currently lists only
`cstr6suwn9.skadnetwork` (Google's own). If you later add mediation or want
fuller iOS attribution, paste in Google's published SKAdNetwork list.

## 3. Add the ad unit IDs to `.env`

```
EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS=ca-app-pub-…/…
EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID=ca-app-pub-…/…
```

Until these are set, `unitId()` in `src/lib/ads.ts` deliberately returns
`null` in release builds, so **no ad is requested at all**. Dev builds fall
back to `TestIds.INTERSTITIAL`. A production build with the real App IDs but
missing unit IDs is silent, not broken — but it earns nothing.

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

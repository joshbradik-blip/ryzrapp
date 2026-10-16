// Free-tier ads (Google AdMob via react-native-google-mobile-ads).
//
// The only placement is ONE interstitial after a completed workout, shown
// once the user taps Done — never during a session. Rules:
//   - Premium users never see ads.
//   - No ads during a user's first FREE_WORKOUTS_BEFORE_ADS completed workouts.
//   - Remote kill switch: app_config.post_workout_ads_enabled (featureFlags).
//   - If the ad hasn't finished loading by the time Done is tapped, skip it.
//     Never make the user wait for an ad.
//
// Targeting: we never pass health, workout or wearable data to the ad SDK
// (Apple guideline 5.1.3). Personalization follows the user's ATT choice
// (prompted in metaAds.ts) and the Google UMP consent form (EU/UK).
//
// The SDK is a native module. Builds made before it was added (reachable by
// an OTA update) don't have it, so everything here is loaded lazily and
// becomes a no-op when the module is missing.

import { Platform, TurboModuleRegistry } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubscriptionStore } from '../store/subscriptionStore';
import { useFeatureFlags } from './featureFlags';

type AdsSdk = typeof import('react-native-google-mobile-ads');
type Interstitial = import('react-native-google-mobile-ads').InterstitialAd;

const FREE_WORKOUTS_BEFORE_ADS = 3;
const COMPLETED_COUNT_KEY = 'ads_completed_workouts_v1';

// "Post-workout" interstitial ad units from AdMob (Apps → Ad units). Not
// secrets — they ship inside every app — so they live here rather than in
// build env, where an OTA update would drop them. The EXPO_PUBLIC_ vars can
// still override them. Dev builds always use Google's test ads instead, so
// our own taps never count as invalid clicks. A platform with no unit ID
// shows no ads.
const INTERSTITIAL_UNIT_ID = Platform.select({
  ios: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_IOS || 'ca-app-pub-9219644602177199/3360952005',
  android: process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ANDROID || 'ca-app-pub-9219644602177199/6603947036',
});

let sdk: AdsSdk | null | undefined;
let ready: Promise<boolean> | null = null;
let interstitial: Interstitial | null = null;
let interstitialLoaded = false;

function loadSdk(): AdsSdk | null {
  if (sdk !== undefined) return sdk;
  try {
    sdk = TurboModuleRegistry.get('RNGoogleMobileAdsModule')
      ? (require('react-native-google-mobile-ads') as AdsSdk)
      : null;
  } catch {
    sdk = null;
  }
  return sdk;
}

function unitId(ads: AdsSdk): string | null {
  if (__DEV__) return ads.TestIds.INTERSTITIAL;
  return INTERSTITIAL_UNIT_ID || null;
}

function adsAllowed(): boolean {
  return !useSubscriptionStore.getState().isPremium && useFeatureFlags.getState().postWorkoutAds;
}

/**
 * Gather consent (Google UMP; only shows a form where the law requires it)
 * and start the SDK. Safe to call repeatedly. Resolves false when ads can't
 * be requested.
 */
function init(): Promise<boolean> {
  if (ready) return ready;
  ready = (async () => {
    const ads = loadSdk();
    if (!ads || !unitId(ads)) return false;
    try {
      const consent = await ads.AdsConsent.gatherConsent();
      if (!consent.canRequestAds) return false;
      await ads.default().initialize();
      return true;
    } catch (error) {
      console.warn('Ads init failed:', error);
      return false;
    }
  })();
  return ready;
}

/**
 * Start loading the post-workout interstitial. Call when the workout-complete
 * screen opens, so it has a few seconds to load while the user reads the summary.
 */
export async function preloadPostWorkoutAd(): Promise<void> {
  if (!adsAllowed()) return;
  const count = Number(await AsyncStorage.getItem(COMPLETED_COUNT_KEY).catch(() => null)) || 0;
  // This workout will be number count + 1.
  if (count + 1 <= FREE_WORKOUTS_BEFORE_ADS) return;
  if (!(await init())) return;

  const ads = loadSdk();
  const id = ads && unitId(ads);
  if (!ads || !id || interstitial) return;

  const ad = ads.InterstitialAd.createForAdRequest(id);
  ad.addAdEventListener(ads.AdEventType.LOADED, () => { interstitialLoaded = true; });
  ad.addAdEventListener(ads.AdEventType.ERROR, () => { interstitial = null; interstitialLoaded = false; });
  ad.addAdEventListener(ads.AdEventType.CLOSED, () => { interstitial = null; interstitialLoaded = false; });
  interstitial = ad;
  ad.load();
}

/**
 * Record a completed workout and, if an interstitial is ready and the user is
 * eligible, show it. Call after the user taps Done on the workout-complete screen.
 */
export async function onWorkoutCompletedForAds(): Promise<void> {
  const count = (Number(await AsyncStorage.getItem(COMPLETED_COUNT_KEY).catch(() => null)) || 0) + 1;
  AsyncStorage.setItem(COMPLETED_COUNT_KEY, String(count)).catch(() => {});

  if (!adsAllowed() || count <= FREE_WORKOUTS_BEFORE_ADS) return;
  if (!interstitial || !interstitialLoaded) return;
  try {
    await interstitial.show();
  } catch {
    interstitial = null;
    interstitialLoaded = false;
  }
}

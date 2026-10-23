import { AppState, Platform, type AppStateStatus } from 'react-native';
import { Settings } from 'react-native-fbsdk-next';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

/**
 * How long to wait for the ATT answer before starting the SDK anyway. Meta
 * wants the advertiser-tracking flag set first, but an unanswered prompt must
 * never cost us the whole launch's attribution — see initMetaAdsTracking.
 */
const ATT_TIMEOUT_MS = 5000;

/**
 * iOS refuses to present the ATT prompt unless the app is foregrounded, and
 * resolves the request as `undetermined` rather than waiting. On a cold launch
 * — especially one from an ad tap, which is exactly the install we care about
 * measuring — the first render can beat the app to `active`, so wait for it
 * instead of firing the prompt into a dead window.
 */
function whenActive(): Promise<void> {
  if (AppState.currentState === 'active') return Promise.resolve();
  return new Promise((resolve) => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        sub.remove();
        resolve();
      }
    });
  });
}

/** Ask for ATT and tell the SDK what the user said. Never rejects. */
async function applyAdvertiserTracking(): Promise<void> {
  try {
    await whenActive();
    const { status } = await requestTrackingPermissionsAsync();
    await Settings.setAdvertiserTrackingEnabled(status === 'granted');
  } catch (error) {
    // Only IDFA-level attribution is affected; SKAdNetwork still measures.
    console.warn('Meta advertiser tracking setup failed:', error);
  }
}

/**
 * Initializes the Meta (Facebook) SDK so ad-driven installs and app opens are
 * attributed to campaigns.
 *
 * On iOS Meta wants `setAdvertiserTrackingEnabled` called before the SDK
 * starts, so that the IDFA rides along with the very first events. But
 * `isAutoInitEnabled` is false in app.json, which makes `initializeSDK()` the
 * only thing that ever starts the SDK — so awaiting the ATT prompt
 * unconditionally, as this used to, means a prompt that stalls or never
 * presents leaves the SDK dark and silently drops the launch's attribution
 * altogether.
 *
 * So: honour the ordering when ATT answers promptly, and start the SDK anyway
 * once ATT_TIMEOUT_MS passes. A late answer still lands — the flag is applied
 * whenever the prompt resolves, and only affects events sent after that.
 */
export async function initMetaAdsTracking(): Promise<void> {
  if (Platform.OS === 'ios') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      applyAdvertiserTracking(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, ATT_TIMEOUT_MS);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }

  try {
    Settings.initializeSDK();
  } catch (error) {
    console.warn('Meta SDK init failed:', error);
  }
}

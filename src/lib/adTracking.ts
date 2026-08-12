// Meta (Facebook/Instagram) app-events tracking, for Ads Manager install &
// purchase measurement. Gated on the iOS App Tracking Transparency prompt —
// Apple requires this whenever the FB SDK is present, tracking or not.
//
// No-ops safely if EXPO_PUBLIC_FACEBOOK_APP_ID isn't set, so local dev
// without Meta credentials configured is unaffected.

import { Platform } from 'react-native';
import { Settings, AppEventsLogger } from 'react-native-fbsdk-next';
import * as TrackingTransparency from 'expo-tracking-transparency';

const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID;

export async function initAdTracking(): Promise<void> {
  if (!FACEBOOK_APP_ID) return;

  if (Platform.OS === 'ios') {
    const { status } = await TrackingTransparency.getTrackingPermissionsAsync();
    if (status === 'undetermined') {
      await TrackingTransparency.requestTrackingPermissionsAsync();
    }
  }
  // Meta reads ATT status itself; ask-first above just lets it use IDFA when granted.
  Settings.initializeSDK();

  Settings.setAutoLogAppEventsEnabled(true);
  Settings.setAdvertiserIDCollectionEnabled(true);
}

// Fire after a completed purchase so Meta campaigns can optimize for
// paying users, not just installs. RevenueCat's own Meta integration
// (Project Settings > Integrations) covers this server-side and is the
// primary signal — this client-side event is a supplementary one.
export function logPurchaseEvent(priceUSD: number, productId: string): void {
  if (!FACEBOOK_APP_ID) return;
  AppEventsLogger.logPurchase(priceUSD, 'USD', { productId });
}

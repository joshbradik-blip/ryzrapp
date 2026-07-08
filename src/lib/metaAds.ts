import { Platform } from 'react-native';
import { Settings } from 'react-native-fbsdk-next';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';

/**
 * Initializes the Meta (Facebook) SDK so ad-driven installs and app opens
 * are attributed to campaigns. On iOS this must run AFTER the App Tracking
 * Transparency prompt — Meta only receives the IDFA if the user allows it;
 * denied users are still measured via SKAdNetwork.
 */
export async function initMetaAdsTracking(): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      const { status } = await requestTrackingPermissionsAsync();
      await Settings.setAdvertiserTrackingEnabled(status === 'granted');
    }
    Settings.initializeSDK();
  } catch (error) {
    console.warn('Meta SDK init failed:', error);
  }
}

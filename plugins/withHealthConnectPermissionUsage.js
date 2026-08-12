// Makes RYZR discoverable by Health Connect on Android 14+ (API 34+).
//
// Health Connect ships as a separate app up to Android 13 and finds clients via
// the `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` intent filter — which
// is all the react-native-health-connect config plugin adds.
//
// From Android 14 it is part of the platform, and the OS instead discovers
// health apps through a `ViewPermissionUsageActivity` alias answering
// VIEW_PERMISSION_USAGE + the HEALTH_PERMISSIONS category. Without it the app
// never appears under Health Connect > App permissions and permission requests
// resolve empty with no UI, which is indistinguishable from a refusal.
//
// Keep both: the rationale filter still covers Android 13 and below.

const { withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const ALIAS_NAME = 'ViewPermissionUsageActivity';

module.exports = (config) =>
  withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);

    app['activity-alias'] = (app['activity-alias'] ?? []).filter(
      (a) => a.$?.['android:name'] !== ALIAS_NAME,
    );

    app['activity-alias'].push({
      $: {
        'android:name': ALIAS_NAME,
        'android:exported': 'true',
        'android:targetActivity': '.MainActivity',
        // Only the system may launch this alias.
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        },
      ],
    });

    return mod;
  });

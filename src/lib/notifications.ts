import * as Notifications from 'expo-notifications';

// Daily motivation now arrives only as in-app coach messages (TodayScreen).
// This one-release helper clears pushes scheduled by <=1.0.7 builds so users
// don't get one last stale 7am notification after updating.
// Remove this file and the expo-notifications dependency in a future release.
export async function cancelLegacyScheduledNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // best-effort cleanup — never block startup
  }
}

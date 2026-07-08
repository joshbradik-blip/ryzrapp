// Local-notification helpers. Everything here is LOCAL scheduling (no push
// server): daily coach message at the user's preferred training time, an
// evening streak-protection nudge, and the in-workout "rest over" alert.
//
// Strategy: initNotifications() runs once at startup and clears everything
// (also cleans stale ≤1.0.7 schedules), then TodayScreen re-schedules the
// daily + streak notifications with fresh content on every app open.

import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

const DAILY_ID = 'ryzr-daily-coach';
const STREAK_ID = 'ryzr-streak-nudge';

export function initNotifications(): void {
  // Suppress banners while the app is foregrounded — in-app UI (rest timer,
  // coach badge) already covers those moments.
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const active = AppState.currentState === 'active';
      return {
        shouldShowBanner: !active,
        shouldShowList: !active,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    },
  });
  // Clean slate each launch (also clears ≤1.0.7 legacy schedules); the Today
  // screen re-schedules with current content right after data loads.
  Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
}

let permissionChecked = false;
export async function ensureNotificationPermissions(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    if (permissionChecked) return false; // don't nag repeatedly in one session
    permissionChecked = true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

/** Hour/minute for each onboarding preferred_time choice. */
export function preferredTimeToClock(pref: string | undefined): { hour: number; minute: number } {
  switch (pref) {
    case 'morning': return { hour: 7, minute: 30 };
    case 'lunch': return { hour: 11, minute: 30 };
    case 'evening': return { hour: 16, minute: 30 };
    default: return { hour: 9, minute: 0 };
  }
}

/** Daily repeating coach message at the user's preferred training time. */
export async function scheduleDailyCoachNotification(
  hour: number,
  minute: number,
  body: string,
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_ID,
      content: { title: 'RYZR Coach', body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch {}
}

/** One-shot evening nudge when today's session hasn't happened yet. */
export async function scheduleStreakNudge(streak: number): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_ID).catch(() => {});
    const fireAt = new Date();
    fireAt.setHours(19, 30, 0, 0);
    if (fireAt.getTime() <= Date.now()) return; // evening already passed
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_ID,
      content: {
        title: streak > 0 ? `🔥 ${streak}-day streak on the line` : '🔥 Time to train',
        body: streak > 0
          ? 'A quick session tonight keeps it alive. You got this.'
          : "There's still time for today's workout.",
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
    });
  } catch {}
}

export async function cancelStreakNudge(): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_ID);
  } catch {}
}

/** "Rest over" alert for the in-workout rest timer (shown only if backgrounded). */
export async function scheduleRestOverNotification(
  seconds: number,
  exerciseName: string,
  setNumber: number,
): Promise<string | null> {
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏱ Rest over',
        body: `Set ${setNumber} of ${exerciseName} — back to work.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: Math.max(1, Math.round(seconds)),
        repeats: false,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelNotification(id: string | null): Promise<void> {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {}
}

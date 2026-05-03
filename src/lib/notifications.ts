import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { generateAffirmation } from './anthropic';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'RYZR Coach',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: 'default',
    });
  }
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

let scheduled = false;

export async function scheduleAffirmationIfNeeded(
  name: string,
  workoutName?: string
): Promise<void> {
  if (scheduled) return;
  scheduled = true;
  try {
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    const message = await generateAffirmation(name, workoutName);
    const tomorrow7am = new Date();
    tomorrow7am.setDate(tomorrow7am.getDate() + 1);
    tomorrow7am.setHours(7, 0, 0, 0);
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'RYZR Coach',
        body: message,
        sound: 'default',
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: tomorrow7am },
    });
  } catch {
    // notifications are nice-to-have — never crash the app
  }
}

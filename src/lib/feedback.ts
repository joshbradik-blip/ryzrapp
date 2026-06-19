import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '../store/settingsStore';

type ImpactStyle = 'light' | 'medium' | 'heavy';

const IMPACT: Record<ImpactStyle, Haptics.ImpactFeedbackStyle> = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
  heavy: Haptics.ImpactFeedbackStyle.Heavy,
};

// Haptic feedback that respects the user's global Haptics setting.
// No-op when disabled, and swallows errors on devices without a taptic engine.
export const haptic = {
  impact(style: ImpactStyle = 'medium') {
    if (!useSettingsStore.getState().hapticsEnabled) return;
    Haptics.impactAsync(IMPACT[style]).catch(() => {});
  },
  success() {
    if (!useSettingsStore.getState().hapticsEnabled) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};

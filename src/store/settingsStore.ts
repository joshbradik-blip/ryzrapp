import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  voiceEnabled: boolean;
  hapticsEnabled: boolean;
  setVoiceEnabled: (value: boolean) => void;
  setHapticsEnabled: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      voiceEnabled: true,
      hapticsEnabled: true,
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    {
      name: 'ryzr-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

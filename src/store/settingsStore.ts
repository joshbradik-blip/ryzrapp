import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  voiceEnabled: boolean;
  hapticsEnabled: boolean;
  /** ElevenLabs voice id for the AI trainer; null = on-device TTS. */
  trainerVoiceId: string | null;
  setVoiceEnabled: (value: boolean) => void;
  setHapticsEnabled: (value: boolean) => void;
  setTrainerVoiceId: (value: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      voiceEnabled: true,
      hapticsEnabled: true,
      trainerVoiceId: null,
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setTrainerVoiceId: (trainerVoiceId) => set({ trainerVoiceId }),
    }),
    {
      name: 'ryzr-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

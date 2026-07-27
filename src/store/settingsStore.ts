import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface SettingsState {
  voiceEnabled: boolean;
  hapticsEnabled: boolean;
  /** ElevenLabs voice id for the AI trainer; null = on-device TTS. */
  trainerVoiceId: string | null;
  /** Whether the user has consented to see the visual "Future You" projection. */
  futureSelfConsent: boolean;
  setVoiceEnabled: (value: boolean) => void;
  setHapticsEnabled: (value: boolean) => void;
  setTrainerVoiceId: (value: string | null) => void;
  setFutureSelfConsent: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      voiceEnabled: true,
      hapticsEnabled: true,
      trainerVoiceId: null,
      futureSelfConsent: false,
      setVoiceEnabled: (voiceEnabled) => set({ voiceEnabled }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
      setTrainerVoiceId: (trainerVoiceId) => set({ trainerVoiceId }),
      setFutureSelfConsent: (futureSelfConsent) => set({ futureSelfConsent }),
    }),
    {
      name: 'ryzr-settings',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

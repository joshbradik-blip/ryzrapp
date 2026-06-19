import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface WearablesState {
  connected: string[];
  toggle: (id: string) => void;
  disconnect: (id: string) => void;
}

export const useWearablesStore = create<WearablesState>()(
  persist(
    (set) => ({
      connected: [],
      toggle: (id) =>
        set((s) => ({
          connected: s.connected.includes(id)
            ? s.connected.filter((c) => c !== id)
            : [...s.connected, id],
        })),
      disconnect: (id) =>
        set((s) => ({ connected: s.connected.filter((c) => c !== id) })),
    }),
    {
      name: 'ryzr-wearables',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

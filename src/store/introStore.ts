import { create } from 'zustand';

interface IntroState {
  seen: boolean | null; // null = not yet loaded from storage
  initSeen: (value: boolean) => void;
  markSeen: () => void;
}

export const useIntroStore = create<IntroState>((set) => ({
  seen: null,
  initSeen: (value) => set({ seen: value }),
  markSeen: () => set({ seen: true }),
}));

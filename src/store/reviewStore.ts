import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface ReviewState {
  /** First time the app considered asking — the clock the "used it a while" gate runs on. */
  firstSeenAt: string | null;
  /** Last time the soft-ask sheet was actually shown. */
  lastPromptedAt: string | null;
  /** How many times the soft-ask has been shown, ever. */
  promptCount: number;
  /** Set once the user rates from Profile by hand — stop asking on our own. */
  optedOut: boolean;

  markSeen: () => void;
  recordPrompt: () => void;
  optOut: () => void;
  /** Test/debug helper — wipes the local gate so the sheet can show again. */
  resetPrompt: () => void;
}

export const useReviewStore = create<ReviewState>()(
  persist(
    (set, get) => ({
      firstSeenAt: null,
      lastPromptedAt: null,
      promptCount: 0,
      optedOut: false,

      markSeen: () => {
        if (!get().firstSeenAt) set({ firstSeenAt: new Date().toISOString() });
      },
      recordPrompt: () =>
        set((s) => ({ lastPromptedAt: new Date().toISOString(), promptCount: s.promptCount + 1 })),
      optOut: () => set({ optedOut: true }),
      resetPrompt: () =>
        set({ firstSeenAt: null, lastPromptedAt: null, promptCount: 0, optedOut: false }),
    }),
    {
      name: 'ryzr-review',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

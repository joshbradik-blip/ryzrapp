import { create } from 'zustand';
import { UserProfile, Injury, SchedulePrefs, Goal } from '../types';

interface ProfileState {
  profile: UserProfile | null;
  injuries: Injury[];
  schedulePrefs: SchedulePrefs | null;
  goals: Goal[];
  equipment: string[];
  onboardingStep: number;

  setProfile: (profile: Partial<UserProfile>) => void;
  setInjuries: (injuries: Injury[]) => void;
  setSchedulePrefs: (prefs: SchedulePrefs) => void;
  setGoals: (goals: Goal[]) => void;
  setEquipment: (equipment: string[]) => void;
  setOnboardingStep: (step: number) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

const DEFAULT_PROFILE: UserProfile = {
  id: '',
  name: '',
  age: 25,
  sex: 'male',
  height_cm: 175,
  weight_kg: 75,
  fitness_level: 'some_experience',
  onboarding_complete: false,
  subscription_tier: 'free',
};

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  injuries: [],
  schedulePrefs: null,
  goals: [],
  equipment: [],
  onboardingStep: 0,

  setProfile: (data) =>
    set((s) => ({
      profile: { ...(s.profile ?? DEFAULT_PROFILE), ...data },
    })),

  setInjuries: (injuries) => set({ injuries }),

  setSchedulePrefs: (schedulePrefs) => set({ schedulePrefs }),

  setGoals: (goals) => set({ goals }),

  setEquipment: (equipment) => set({ equipment }),

  setOnboardingStep: (step) => set({ onboardingStep: step }),

  completeOnboarding: () =>
    set((s) => ({
      profile: s.profile
        ? { ...s.profile, onboarding_complete: true }
        : null,
    })),

  reset: () =>
    set({
      profile: null,
      injuries: [],
      schedulePrefs: null,
      goals: [],
      equipment: [],
      onboardingStep: 0,
    }),
}));

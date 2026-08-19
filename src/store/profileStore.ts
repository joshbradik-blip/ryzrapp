import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserProfile, Injury, SchedulePrefs, Goal } from '../types';
import { useWorkoutStore } from './workoutStore';
import { FULL_GYM_PLAN } from '../constants/plans/fullGymPlan';
import { BODYWEIGHT_PLAN } from '../constants/plans/bodyweightPlan';

interface ProfileState {
  profile: UserProfile | null;
  injuries: Injury[];
  disabilities: string[];
  schedulePrefs: SchedulePrefs | null;
  goals: Goal[];
  equipment: string[];
  onboardingStep: number;

  setProfile: (profile: Partial<UserProfile>) => void;
  setInjuries: (injuries: Injury[]) => void;
  setDisabilities: (disabilities: string[]) => void;
  setSchedulePrefs: (prefs: SchedulePrefs) => void;
  setGoals: (goals: Goal[]) => void;
  setEquipment: (equipment: string[]) => void;
  setOnboardingStep: (step: number) => void;
  completeOnboarding: () => void;
  // Skip the AI questionnaire: load one of the hand-authored static plans,
  // filling in a default profile if the user hasn't gone through ProfileBasics
  // yet. Deliberately does NOT complete onboarding — PlanReadyScreen shows the
  // user what they got first, and completing there is what enters the app.
  applyStaticPlan: (planType: 'full_gym' | 'bodyweight', userId?: string) => void;
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
  weight_unit: 'lbs',
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: null,
      injuries: [],
      disabilities: [],
      schedulePrefs: null,
      goals: [],
      equipment: [],
      onboardingStep: 0,

      setProfile: (data) =>
        set((s) => ({
          profile: { ...(s.profile ?? DEFAULT_PROFILE), ...data },
        })),

      setInjuries: (injuries) => set({ injuries }),

      setDisabilities: (disabilities) => set({ disabilities }),

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

      applyStaticPlan: (planType, userId) => {
        const plan = planType === 'full_gym' ? FULL_GYM_PLAN : BODYWEIGHT_PLAN;
        set((s) => ({
          profile: {
            ...(s.profile ?? DEFAULT_PROFILE),
            id: userId ?? s.profile?.id ?? '',
          },
        }));
        useWorkoutStore.getState().setWorkouts(plan);
        useWorkoutStore.getState().setTodayWorkout(plan[0] ?? null);
      },

      reset: () =>
        set({
          profile: null,
          injuries: [],
          disabilities: [],
          schedulePrefs: null,
          goals: [],
          equipment: [],
          onboardingStep: 0,
        }),
    }),
    {
      name: 'ryzr-profile',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

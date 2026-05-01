import React, { useEffect, useState, useRef } from 'react';
import { View, Text, SafeAreaView, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types';
import { useProfileStore } from '../../store/profileStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { generateWorkoutPlan } from '../../lib/anthropic';
import { Colors } from '../../constants/theme';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'GeneratingPlan'>;
};

const STEPS = [
  'Analyzing your goals...',
  'Factoring in your injuries...',
  'Matching your equipment...',
  'Designing week 1...',
  'Applying progressive overload...',
  'Plan ready!',
];

export function GeneratingPlanScreen({ navigation }: Props) {
  const { profile, injuries, schedulePrefs, goals, equipment, completeOnboarding } = useProfileStore();
  const { setWorkouts, setTodayWorkout } = useWorkoutStore();
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pulseAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.8, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (stepIndex < STEPS.length - 2) {
      const t = setTimeout(() => setStepIndex((i) => i + 1), 1200);
      return () => clearTimeout(t);
    }
  }, [stepIndex]);

  useEffect(() => {
    const run = async () => {
      try {
        const workouts = await generateWorkoutPlan({
          profile: profile!,
          injuries,
          schedule: schedulePrefs!,
          goals,
          equipment,
        });
        setWorkouts(workouts);
        if (workouts.length > 0) setTodayWorkout(workouts[0]);
        setStepIndex(STEPS.length - 1);
        completeOnboarding();
      } catch (e: any) {
        // Fallback: use a sample workout so the user isn't stuck
        const { EXERCISES } = require('../../constants/exercises');
        const sampleWorkout = {
          id: 'sample-1',
          name: 'Full Body Kickstart',
          focus: 'General fitness',
          estimated_duration_min: 45,
          week_number: 1,
          day_number: 1,
          exercises: [
            { id: 'we-1', exercise: EXERCISES[0], target_sets: 3, target_reps: '8-10', target_rpe: 7, rest_seconds: 90, order: 0 },
            { id: 'we-2', exercise: EXERCISES[5], target_sets: 3, target_reps: '10-12', target_rpe: 7, rest_seconds: 60, order: 1 },
            { id: 'we-3', exercise: EXERCISES[13], target_sets: 3, target_reps: '30s hold', target_rpe: 6, rest_seconds: 60, order: 2 },
            { id: 'we-4', exercise: EXERCISES[10], target_sets: 3, target_reps: '10', target_rpe: 7, rest_seconds: 75, order: 3 },
          ],
        };
        setWorkouts([sampleWorkout]);
        setTodayWorkout(sampleWorkout);
        setStepIndex(STEPS.length - 1);
        completeOnboarding();
      }
    };
    run();
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      {/* Animated ring */}
      <Animated.View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: Colors.primary + '22',
          borderWidth: 3,
          borderColor: Colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 48,
          transform: [{ scale: pulseAnim }],
          shadowColor: Colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.5,
          shadowRadius: 20,
        }}
      >
        <Ionicons name="flash" size={48} color={Colors.primary} />
      </Animated.View>

      <Text style={{ fontSize: 26, fontWeight: '900', color: Colors.text, marginBottom: 16, textAlign: 'center' }}>
        {stepIndex === STEPS.length - 1 ? 'Your plan is ready!' : 'Building your plan...'}
      </Text>

      <View style={{ gap: 10, alignItems: 'flex-start', width: '100%', maxWidth: 280 }}>
        {STEPS.map((step, i) => (
          <View key={step} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: i < stepIndex ? Colors.primary : i === stepIndex ? Colors.primary + '44' : Colors.surface3,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {i < stepIndex && <Ionicons name="checkmark" size={12} color="#000" />}
            </View>
            <Text
              style={{
                color: i <= stepIndex ? Colors.text : Colors.muted,
                fontSize: 15,
                fontWeight: i === stepIndex ? '700' : '400',
              }}
            >
              {step}
            </Text>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

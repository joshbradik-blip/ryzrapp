import React, { useEffect, useState, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
  const { profile, injuries, disabilities, schedulePrefs, goals, equipment, completeOnboarding } = useProfileStore();
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
          disabilities,
          schedule: schedulePrefs!,
          goals,
          equipment,
        });
        setWorkouts(workouts);
        if (workouts.length > 0) setTodayWorkout(workouts[0]);
        setStepIndex(STEPS.length - 1);
        completeOnboarding();
      } catch (e: any) {
        console.error('[GeneratingPlan] failed:', e?.message);
        setError(e?.message ?? 'Could not generate your plan. Please check your connection and try again.');
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

      {error ? (
        <Text style={{ fontSize: 16, color: '#FF4444', textAlign: 'center', marginBottom: 16 }}>{error}</Text>
      ) : (
        <Text style={{ fontSize: 26, fontWeight: '900', color: Colors.text, marginBottom: 16, textAlign: 'center' }}>
          {stepIndex === STEPS.length - 1 ? 'Your plan is ready!' : 'Building your plan...'}
        </Text>
      )}

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

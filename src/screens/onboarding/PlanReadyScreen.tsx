import React, { useEffect, useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { OnboardingStackParamList } from '../../types';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { GradientButton } from '../../components/ui/GradientButton';
import { useProfileStore } from '../../store/profileStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { Colors, BorderRadius } from '../../constants/theme';
import { logFunnelStep } from '../../lib/funnel';

type Props = {
  navigation: NativeStackNavigationProp<OnboardingStackParamList, 'PlanReady'>;
  route: RouteProp<OnboardingStackParamList, 'PlanReady'>;
};

const PLAN_LABEL: Record<'full_gym' | 'bodyweight', string> = {
  full_gym: 'Full Gym',
  bodyweight: 'Bodyweight',
};

/**
 * The free tier's activation moment.
 *
 * Picking Full Gym or Bodyweight used to drop the user straight into the app,
 * so the plan they'd just been handed arrived silently and read as "the app
 * loaded". This screen names what they got before they get there.
 *
 * Everything shown is derived from the loaded workouts rather than hardcoded,
 * so editing a plan in src/constants/plans/ keeps this screen honest.
 */
export function PlanReadyScreen({ navigation, route }: Props) {
  const { choice } = route.params;
  const { completeOnboarding } = useProfileStore();
  const workouts = useWorkoutStore((s) => s.workouts);

  useEffect(() => {
    logFunnelStep('static_plan_ready_viewed', { choice }, false);
  }, [choice]);

  const summary = useMemo(() => {
    if (workouts.length === 0) {
      return { weeks: 0, daysPerWeek: 0, minutes: 0, split: [] as string[] };
    }
    const weeks = workouts.reduce((max, w) => Math.max(max, w.week_number), 0);
    const firstWeek = workouts
      .filter((w) => w.week_number === 1)
      .sort((a, b) => a.day_number - b.day_number);
    const minutes = Math.round(
      workouts.reduce((sum, w) => sum + w.estimated_duration_min, 0) / workouts.length
    );
    return {
      weeks,
      daysPerWeek: firstWeek.length,
      minutes,
      // Both plans repeat their week-1 template, so week 1 is the split.
      split: Array.from(new Set(firstWeek.map((w) => w.name))),
    };
  }, [workouts]);

  const handleStart = () => {
    logFunnelStep('static_plan_started', { choice }, false);
    completeOnboarding();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 20,
            backgroundColor: Colors.primary + '22',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
          }}
        >
          <Ionicons name="checkmark-circle" size={36} color={Colors.primary} />
        </View>

        <SectionLabel>You're set</SectionLabel>
        <Text style={{ fontSize: 30, fontWeight: '900', color: Colors.text, marginTop: 8 }}>
          Your plan is ready
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginTop: 8, lineHeight: 22 }}>
          {PLAN_LABEL[choice]} — a complete program, built and waiting. Start whenever you like;
          RYZR tracks every set as you go.
        </Text>

        {/* Headline numbers, straight off the loaded plan. */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 28 }}>
          {[
            { value: `${summary.weeks}`, label: summary.weeks === 1 ? 'week' : 'weeks' },
            { value: `${summary.daysPerWeek}`, label: 'days / week' },
            { value: `${summary.minutes}`, label: 'min / session' },
          ].map((tile) => (
            <View
              key={tile.label}
              style={{
                flex: 1,
                backgroundColor: Colors.surface,
                borderRadius: BorderRadius.lg,
                borderWidth: 1,
                borderColor: Colors.border,
                paddingVertical: 16,
                alignItems: 'center',
              }}
            >
              <Text style={{ color: Colors.primary, fontSize: 26, fontWeight: '900' }}>
                {tile.value}
              </Text>
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 2 }}>{tile.label}</Text>
            </View>
          ))}
        </View>

        {summary.split.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <SectionLabel>Your week</SectionLabel>
            <View style={{ gap: 8, marginTop: 10 }}>
              {summary.split.map((name, i) => (
                <View
                  key={name}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: Colors.surface,
                    borderRadius: BorderRadius.md,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text
                    style={{
                      color: Colors.primary,
                      fontSize: 13,
                      fontWeight: '800',
                      width: 20,
                    }}
                  >
                    {i + 1}
                  </Text>
                  <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '600', flex: 1 }}>
                    {name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ marginTop: 32 }}>
          <GradientButton title="Start training" onPress={handleStart} icon="arrow-forward" />
        </View>

        <Text
          style={{
            color: Colors.muted,
            fontSize: 12,
            textAlign: 'center',
            marginTop: 14,
            lineHeight: 18,
          }}
        >
          Want a plan built around your goals, injuries, and schedule? Upgrade anytime from the
          Store tab.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// One predesigned program: what it is, what is in it, and a Start button.
//
// Starting a program hands it to the workout store as `programWorkout` and
// navigates into the normal WorkoutSession, so the rest timer, set logging,
// Form Coach and history all behave exactly as they do for a plan workout.
// The plan itself is untouched — `workouts` and `todayWorkout` are not
// written, so a program never costs the user their scheduled day.

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { GradientButton } from '../../components/ui/GradientButton';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { equipmentLabel } from '../../components/today/ProgramCard';
import { Colors } from '../../constants/theme';
import { fetchPrograms, programToWorkout } from '../../lib/programs';
import { useWorkoutStore } from '../../store/workoutStore';
import type { TodayStackParamList, WorkoutProgram } from '../../types';

export function ProgramDetailScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const { programId } = useRoute<RouteProp<TodayStackParamList, 'ProgramDetail'>>().params;
  const setProgramWorkout = useWorkoutStore((s) => s.setProgramWorkout);

  const [program, setProgram] = useState<WorkoutProgram | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchPrograms()
      .then((programs) => {
        if (!active) return;
        setProgram(programs.find((p) => p.id === programId) ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [programId]);

  useEffect(() => {
    if (program) navigation.setOptions({ title: program.name });
  }, [navigation, program]);

  const handleStart = () => {
    if (!program) return;
    const workout = programToWorkout(program);
    setProgramWorkout(workout);
    navigation.navigate('WorkoutSession', { workoutId: workout.id });
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, justifyContent: 'center' }}>
        <ActivityIndicator color={Colors.primary} />
      </SafeAreaView>
    );
  }

  // The program was retired or hidden from the dashboard while the user was
  // looking at the list. Say so plainly rather than showing an empty shell.
  if (!program) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="help-circle-outline" size={40} color={Colors.muted} />
          <Text style={{ color: Colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 }}>
            Program unavailable
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 6 }}>
            This one is no longer available. Pull back and pick another.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['bottom']}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingBottom: 40 }}>
        <SectionLabel>{program.category}</SectionLabel>

        <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '800', marginTop: 8 }}>
          {program.name}
        </Text>

        {program.goal && (
          <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '600', marginTop: 6 }}>
            {program.goal}
          </Text>
        )}

        <Text style={{ color: Colors.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 12 }}>
          {program.description}
        </Text>

        {/* At-a-glance facts */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
          <Fact icon="time-outline" label={`${program.durationMin} min`} />
          <Fact icon="barbell-outline" label={`${program.exercises.length} exercises`} />
          <Fact icon="trending-up-outline" label={program.difficulty} />
          <Fact icon="cube-outline" label={equipmentLabel(program.equipment)} />
        </View>

        <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 24 }} />

        <SectionLabel>What you'll do</SectionLabel>

        <View style={{ marginTop: 12, gap: 10 }}>
          {program.exercises.map((item, index) => (
            <View
              key={item.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: Colors.surface,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: Colors.border,
              }}
            >
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: Colors.surface2,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '800' }}>
                  {index + 1}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '700' }}>
                  {item.exercise.name}
                </Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                  {item.target_sets} × {item.target_reps}
                  {item.rest_seconds > 0 ? ` · ${item.rest_seconds}s rest` : ''}
                </Text>
                {item.notes && (
                  <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                    {item.notes}
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>

        <GradientButton
          title="Start program"
          icon="play"
          onPress={handleStart}
          style={{ marginTop: 28 }}
        />

        <Text
          style={{ color: Colors.muted, fontSize: 12, textAlign: 'center', marginTop: 12, lineHeight: 17 }}
        >
          This is a one-off session. Your training plan stays exactly as it is.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Fact({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.surface,
        borderRadius: 999,
        paddingVertical: 7,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: Colors.border,
      }}
    >
      <Ionicons name={icon} size={14} color={Colors.primary} />
      <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

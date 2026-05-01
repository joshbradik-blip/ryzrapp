import React from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { useProfileStore } from '../../store/profileStore';
import { useWorkoutStore } from '../../store/workoutStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/ui/Button';
import { ExerciseCard } from '../../components/workout/ExerciseCard';
import { Colors } from '../../constants/theme';

export function TodayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const { profile } = useProfileStore();
  const { todayWorkout, workouts } = useWorkoutStore();
  const { isPremium } = useSubscriptionStore();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const streak = 12; // TODO: calculate from sessions table
  const weekCompleted = workouts.filter((w) => w.week_number === 1).length;
  const weekPlanned = workouts.length;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={{ padding: 24, paddingBottom: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, fontWeight: '600' }}>{greeting}</Text>
            <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900', marginTop: 2 }}>
              {profile?.name ?? 'Athlete'} 👋
            </Text>
          </View>
          {/* Streak badge */}
          <View style={{
            backgroundColor: '#FF6B2222',
            borderRadius: 20,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderWidth: 1,
            borderColor: '#FF6B22',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
            <Ionicons name="flame" size={20} color="#FF6B22" />
            <View>
              <Text style={{ color: '#FF6B22', fontSize: 18, fontWeight: '900' }}>{streak}</Text>
              <Text style={{ color: '#FF6B22', fontSize: 10, fontWeight: '600' }}>STREAK</Text>
            </View>
          </View>
        </View>

        {/* Today's workout hero card */}
        {todayWorkout ? (
          <View style={{ marginHorizontal: 24, marginTop: 16 }}>
            <View style={{
              backgroundColor: Colors.surface,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: Colors.border,
              overflow: 'hidden',
            }}>
              {/* Green accent bar */}
              <View style={{ height: 4, backgroundColor: Colors.primary }} />

              <View style={{ padding: 20 }}>
                <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>TODAY'S WORKOUT</Text>
                <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '900', marginTop: 4 }}>{todayWorkout.name}</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 14, marginTop: 4, marginBottom: 16 }}>
                  {todayWorkout.focus} · {todayWorkout.estimated_duration_min} min · {todayWorkout.exercises.length} exercises
                </Text>

                {/* Exercise previews */}
                <View style={{ gap: 6, marginBottom: 20 }}>
                  {todayWorkout.exercises.slice(0, 3).map((we, i) => (
                    <TouchableOpacity
                      key={we.id}
                      onPress={() => navigation.navigate('ExerciseDetail', {
                        exerciseId: we.exercise.id,
                        workoutId: todayWorkout.id,
                        workoutExerciseId: we.id,
                      })}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
                    >
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.primary + '22', alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
                      </View>
                      <Text style={{ color: Colors.textSecondary, fontSize: 14, flex: 1 }}>
                        {we.exercise.name} — {we.target_sets}×{we.target_reps}
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color={Colors.muted} />
                    </TouchableOpacity>
                  ))}
                  {todayWorkout.exercises.length > 3 && (
                    <Text style={{ color: Colors.muted, fontSize: 13, marginLeft: 32 }}>
                      +{todayWorkout.exercises.length - 3} more
                    </Text>
                  )}
                </View>

                <Button
                  title="Start Workout"
                  onPress={() => navigation.navigate('WorkoutSession', { workoutId: todayWorkout.id })}
                  size="lg"
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={{
            margin: 24,
            backgroundColor: Colors.surface,
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: Colors.border,
            alignItems: 'center',
          }}>
            <Ionicons name="leaf-outline" size={40} color={Colors.primary} style={{ marginBottom: 12 }} />
            <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Rest day</Text>
            <Text style={{ color: Colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 6 }}>
              Take it easy — recovery is when you grow.
            </Text>
          </View>
        )}

        {/* Quick stats */}
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 24, marginTop: 20 }}>
          {[
            { label: 'This week', value: `${weekCompleted}/${weekPlanned}`, sub: 'workouts' },
            { label: 'Longest streak', value: '12', sub: 'days' },
            { label: 'Total sessions', value: '48', sub: 'all time' },
          ].map((stat) => (
            <View key={stat.label} style={{
              flex: 1,
              backgroundColor: Colors.surface,
              borderRadius: 14,
              padding: 14,
              borderWidth: 1,
              borderColor: Colors.border,
            }}>
              <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>{stat.label.toUpperCase()}</Text>
              <Text style={{ color: Colors.primary, fontSize: 22, fontWeight: '900', marginTop: 4 }}>{stat.value}</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{stat.sub}</Text>
            </View>
          ))}
        </View>

        {/* AI Premium prompt */}
        {!isPremium && (
          <TouchableOpacity
            style={{
              margin: 24,
              marginTop: 20,
              backgroundColor: Colors.primary + '11',
              borderRadius: 16,
              padding: 18,
              borderWidth: 1,
              borderColor: Colors.primary + '44',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
            }}
            onPress={() => {}}
          >
            <Ionicons name="hardware-chip-outline" size={28} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.primary, fontWeight: '800', fontSize: 14 }}>Unlock AI Form Coach</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Real-time camera analysis — upgrade to Premium
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
          </TouchableOpacity>
        )}

        {/* Upcoming workouts */}
        {workouts.length > 1 && (
          <View style={{ paddingHorizontal: 24 }}>
            <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '800', marginBottom: 12 }}>Coming up</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24, paddingHorizontal: 24 }}>
              {workouts.slice(1, 5).map((w) => (
                <View key={w.id} style={{
                  width: 160,
                  backgroundColor: Colors.surface,
                  borderRadius: 14,
                  padding: 14,
                  marginRight: 10,
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}>
                  <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '600' }}>WEEK {w.week_number} · DAY {w.day_number}</Text>
                  <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>{w.name}</Text>
                  <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 4 }}>{w.estimated_duration_min} min</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

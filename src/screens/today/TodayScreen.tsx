import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { CoachChatSheet } from './CoachChatSheet';
import { PremiumModal } from '../../components/ui/PremiumModal';
import { scheduleAffirmationIfNeeded } from '../../lib/notifications';
import { generateWorkoutPlan } from '../../lib/anthropic';

export function TodayScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const { profile, injuries, disabilities, schedulePrefs, goals, equipment } = useProfileStore();
  const { todayWorkout, workouts, currentWorkoutIndex, setWorkouts, setTodayWorkout, selectWorkout } = useWorkoutStore();
  const { isPremium } = useSubscriptionStore();
  const [chatOpen, setChatOpen] = useState(false);
  const [premiumOpen, setPremiumOpen] = useState(false);
  const [premiumFeatureTitle, setPremiumFeatureTitle] = useState<string | undefined>();
  const [regenerating, setRegenerating] = useState(false);

  const openPremium = (title?: string) => {
    setPremiumFeatureTitle(title);
    setPremiumOpen(true);
  };

  const handleRegenerate = async () => {
    if (!isPremium) {
      openPremium('Unlimited Plan Regeneration');
      return;
    }
    if (!profile || !schedulePrefs) {
      Alert.alert('Profile incomplete', 'Complete your profile before regenerating a plan.');
      return;
    }
    Alert.alert('Regenerate workout?', "We'll build you a fresh plan based on your current profile.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Regenerate',
        onPress: async () => {
          setRegenerating(true);
          try {
            const newWorkouts = await generateWorkoutPlan({ profile, injuries, disabilities, schedule: schedulePrefs, goals, equipment });
            setWorkouts(newWorkouts);
            if (newWorkouts.length > 0) setTodayWorkout(newWorkouts[0]);
            Alert.alert('Done!', 'Your new workout plan is ready.');
          } catch {
            Alert.alert('Error', 'Could not generate a new plan. Try again in a moment.');
          } finally {
            setRegenerating(false);
          }
        },
      },
    ]);
  };

  useEffect(() => {
    if (profile?.name) {
      scheduleAffirmationIfNeeded(profile.name, todayWorkout?.name);
    }
  }, [profile?.name, todayWorkout?.name]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const streak = 0;
  const weekCompleted = workouts.filter((w) => w.week_number === 1).length;
  const weekPlanned = workouts.length;

  // Upcoming workouts in plan order, starting after the current one and
  // wrapping around so every other day is reachable.
  const upcoming = workouts.length > 1
    ? Array.from({ length: workouts.length - 1 }, (_, i) =>
        workouts[(currentWorkoutIndex + 1 + i) % workouts.length])
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: Colors.background }}>
    <SafeAreaView style={{ flex: 1 }}>
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
            { label: 'Longest streak', value: '0', sub: 'days' },
            { label: 'Total sessions', value: '0', sub: 'all time' },
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

        {/* Regenerate workout */}
        <TouchableOpacity
          onPress={handleRegenerate}
          disabled={regenerating}
          activeOpacity={0.8}
          style={{
            marginHorizontal: 24,
            marginTop: 12,
            backgroundColor: Colors.surface,
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 18,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            borderWidth: 1,
            borderColor: Colors.border,
          }}
        >
          <Ionicons name="refresh-outline" size={20} color={regenerating ? Colors.muted : Colors.primary} />
          <Text style={{ color: regenerating ? Colors.muted : Colors.text, fontWeight: '700', fontSize: 14, flex: 1 }}>
            {regenerating ? 'Generating new plan…' : 'Regenerate today\'s workout'}
          </Text>
          {!regenerating && <Ionicons name="chevron-forward" size={16} color={Colors.muted} />}
        </TouchableOpacity>

        {/* Premium upsell card */}
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
            onPress={() => openPremium()}
          >
            <Ionicons name="flash" size={28} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: Colors.primary, fontWeight: '800', fontSize: 14 }}>Upgrade to Premium</Text>
              <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Form Coach · AI Coach · 8 & 12-week plans
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.primary} />
          </TouchableOpacity>
        )}

        {/* Upcoming workouts */}
        {upcoming.length > 0 && (
          <View style={{ paddingHorizontal: 24, marginTop: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: Colors.text, fontSize: 18, fontWeight: '800' }}>Coming up</Text>
              <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 }}>TAP TO SWITCH</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -24, paddingHorizontal: 24 }}>
              {upcoming.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  activeOpacity={0.8}
                  onPress={() => selectWorkout(w.id)}
                  style={{
                    width: 160,
                    backgroundColor: Colors.surface,
                    borderRadius: 14,
                    padding: 14,
                    marginRight: 10,
                    borderWidth: 1,
                    borderColor: Colors.border,
                  }}
                >
                  <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '600' }}>WEEK {w.week_number} · DAY {w.day_number}</Text>
                  <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 }} numberOfLines={2}>{w.name}</Text>
                  <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 4 }}>{w.estimated_duration_min} min</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>

    {/* Floating coach button */}
    <TouchableOpacity
      style={styles.coachFab}
      onPress={() => isPremium ? setChatOpen(true) : openPremium('AI Coach Chat')}
      activeOpacity={0.85}
    >
      {!isPremium && <Ionicons name="lock-closed" size={14} color="#000" />}
      <Ionicons name="chatbubble-ellipses" size={20} color="#000" />
      <Text style={styles.coachFabLabel}>Ask me</Text>
    </TouchableOpacity>

    <CoachChatSheet visible={chatOpen} onClose={() => setChatOpen(false)} />
    <PremiumModal
      visible={premiumOpen}
      onClose={() => setPremiumOpen(false)}
      featureTitle={premiumFeatureTitle}
    />
    </View>
  );
}

const styles = StyleSheet.create({
  coachFab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    height: 48,
    paddingHorizontal: 20,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  coachFabLabel: {
    color: '#000',
    fontWeight: '800',
    fontSize: 15,
  },
});

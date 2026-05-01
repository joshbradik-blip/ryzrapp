import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Vibration,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { useWorkoutStore } from '../../store/workoutStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { Button } from '../../components/ui/Button';
import { Colors } from '../../constants/theme';
import * as Haptics from 'expo-haptics';

type Props = NativeStackScreenProps<TodayStackParamList, 'WorkoutSession'>;

export function WorkoutSessionScreen({ navigation, route }: Props) {
  const { workoutId } = route.params;
  const { workouts, todayWorkout, startSession, logSet, nextExercise, currentExerciseIndex, completeSession } = useWorkoutStore();
  const { isPremium } = useSubscriptionStore();

  const workout = workouts.find((w) => w.id === workoutId) ?? todayWorkout;

  const [setIndex, setSetIndex] = useState(0);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [restActive, setRestActive] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const [completedSets, setCompletedSets] = useState<Record<string, number>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentExercise = workout?.exercises[currentExerciseIndex];
  const isLastExercise = workout && currentExerciseIndex >= workout.exercises.length - 1;

  useEffect(() => {
    if (workout) startSession(workout.id);
  }, []);

  useEffect(() => {
    if (restActive && restRemaining > 0) {
      timerRef.current = setInterval(() => {
        setRestRemaining((r) => {
          if (r <= 1) {
            clearInterval(timerRef.current!);
            setRestActive(false);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return 0;
          }
          if (r <= 4) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          return r - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [restActive]);

  if (!workout || !currentExercise) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.text, fontSize: 18 }}>No workout found.</Text>
      </SafeAreaView>
    );
  }

  const handleLogSet = () => {
    if (!reps) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    logSet({
      workoutExerciseId: currentExercise.id,
      setNumber: setIndex + 1,
      reps: parseInt(reps, 10),
      weight: parseFloat(weight) || 0,
    });

    const key = currentExercise.id;
    const newCount = (completedSets[key] ?? 0) + 1;
    setCompletedSets((prev) => ({ ...prev, [key]: newCount }));

    const restSecs = currentExercise.rest_seconds || 90;
    setRestRemaining(restSecs);
    setRestActive(true);
    setReps('');

    if (newCount >= currentExercise.target_sets) {
      // Move to next after rest (handled by next button)
    } else {
      setSetIndex((i) => i + 1);
    }
  };

  const handleNextExercise = () => {
    setRestActive(false);
    setSetIndex(0);
    setWeight('');
    setReps('');
    if (timerRef.current) clearInterval(timerRef.current);
    nextExercise();
  };

  const handleFinish = () => {
    Alert.alert('How did that feel?', '', [
      { text: 'Too easy', onPress: () => finish('easy') },
      { text: 'Just right', onPress: () => finish('just_right') },
      { text: 'Hard', onPress: () => finish('hard') },
    ]);
  };

  const finish = (rating: 'easy' | 'just_right' | 'hard') => {
    completeSession(rating);
    navigation.replace('WorkoutComplete', { sessionId: 'session-1' });
  };

  const completedCount = completedSets[currentExercise.id] ?? 0;
  const exerciseProgress = `${currentExerciseIndex + 1}/${workout.exercises.length}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Top progress bar */}
      <View style={{ height: 3, backgroundColor: Colors.surface3 }}>
        <View style={{
          height: 3,
          backgroundColor: Colors.primary,
          width: `${((currentExerciseIndex + 1) / workout.exercises.length) * 100}%`,
        }} />
      </View>

      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24 }} keyboardShouldPersistTaps="handled">
        {/* Exercise header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: Colors.muted, fontSize: 13, fontWeight: '600' }}>
            EXERCISE {exerciseProgress}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('ExerciseDetail', {
            exerciseId: currentExercise.exercise.id,
            workoutId,
            workoutExerciseId: currentExercise.id,
          })}>
            <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '600' }}>View demo →</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '900', marginBottom: 4 }}>
          {currentExercise.exercise.name}
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 24 }}>
          {currentExercise.target_sets} sets × {currentExercise.target_reps}
          {currentExercise.target_rpe > 0 ? ` · RPE ${currentExercise.target_rpe}` : ''}
        </Text>

        {/* Set counter */}
        <View style={{
          flexDirection: 'row',
          gap: 10,
          marginBottom: 32,
        }}>
          {Array.from({ length: currentExercise.target_sets }).map((_, i) => (
            <View
              key={i}
              style={{
                flex: 1,
                height: 8,
                borderRadius: 4,
                backgroundColor: i < completedCount ? Colors.primary : Colors.surface3,
              }}
            />
          ))}
        </View>

        <Text style={{ color: Colors.text, fontSize: 20, fontWeight: '700', marginBottom: 16 }}>
          Set {Math.min(completedCount + 1, currentExercise.target_sets)} of {currentExercise.target_sets}
        </Text>

        {/* Weight & reps inputs */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>WEIGHT (kg)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setWeight((w) => String(Math.max(0, (parseFloat(w) || 0) - 2.5)))}
                style={{ width: 44, height: 52, backgroundColor: Colors.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '700' }}>−</Text>
              </TouchableOpacity>
              <TextInput
                value={weight}
                onChangeText={setWeight}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={Colors.muted}
                style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 10, padding: 14, color: Colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center', borderWidth: 1, borderColor: Colors.border }}
              />
              <TouchableOpacity
                onPress={() => setWeight((w) => String((parseFloat(w) || 0) + 2.5))}
                style={{ width: 44, height: 52, backgroundColor: Colors.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ color: Colors.primary, fontSize: 22, fontWeight: '700' }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginBottom: 6 }}>REPS</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => setReps((r) => String(Math.max(0, (parseInt(r, 10) || 0) - 1)))}
                style={{ width: 44, height: 52, backgroundColor: Colors.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '700' }}>−</Text>
              </TouchableOpacity>
              <TextInput
                value={reps}
                onChangeText={setReps}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={Colors.muted}
                style={{ flex: 1, backgroundColor: Colors.surface2, borderRadius: 10, padding: 14, color: Colors.text, fontSize: 20, fontWeight: '700', textAlign: 'center', borderWidth: 1, borderColor: Colors.border }}
              />
              <TouchableOpacity
                onPress={() => setReps((r) => String((parseInt(r, 10) || 0) + 1))}
                style={{ width: 44, height: 52, backgroundColor: Colors.surface2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border }}
              >
                <Text style={{ color: Colors.primary, fontSize: 22, fontWeight: '700' }}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Rest timer overlay */}
        {restActive && (
          <View style={{
            backgroundColor: Colors.surface2,
            borderRadius: 16,
            padding: 20,
            marginBottom: 20,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: Colors.border,
          }}>
            <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1 }}>REST</Text>
            <Text style={{ color: Colors.primary, fontSize: 52, fontWeight: '900' }}>
              {restRemaining}s
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                onPress={() => setRestRemaining((r) => Math.max(0, r - 15))}
                style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.surface3, borderRadius: 8 }}
              >
                <Text style={{ color: Colors.text, fontWeight: '600' }}>−15s</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setRestActive(false); if (timerRef.current) clearInterval(timerRef.current); }}
                style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.surface3, borderRadius: 8 }}
              >
                <Text style={{ color: Colors.text, fontWeight: '600' }}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRestRemaining((r) => r + 15)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, backgroundColor: Colors.surface3, borderRadius: 8 }}
              >
                <Text style={{ color: Colors.text, fontWeight: '600' }}>+15s</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action buttons */}
        <Button title="Log Set" onPress={handleLogSet} size="lg" disabled={!reps} style={{ marginBottom: 12 }} />

        {/* Form coach (premium) */}
        <TouchableOpacity
          onPress={() => {
            if (!isPremium) {
              Alert.alert('Premium Feature', 'Upgrade to RYZR Premium to unlock the AI Form Coach.');
              return;
            }
            navigation.navigate('FormCoach', {
              exerciseId: currentExercise.exercise.id,
              exerciseName: currentExercise.exercise.name,
            });
          }}
          style={{
            padding: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isPremium ? Colors.border : Colors.primary + '44',
            alignItems: 'center',
            marginBottom: 12,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Ionicons name={isPremium ? 'camera-outline' : 'lock-closed-outline'} size={18} color={isPremium ? Colors.text : Colors.primary} />
          <Text style={{ color: isPremium ? Colors.text : Colors.primary, fontWeight: '700' }}>
            {isPremium ? 'Check My Form' : 'Form Coach (Premium)'}
          </Text>
        </TouchableOpacity>

        {/* Next exercise / Finish */}
        {completedCount >= currentExercise.target_sets && (
          isLastExercise ? (
            <Button
              title="Finish Workout"
              onPress={handleFinish}
              variant="primary"
              size="lg"
              style={{ marginTop: 8 }}
            />
          ) : (
            <Button
              title={`Next: ${workout.exercises[currentExerciseIndex + 1]?.exercise.name}`}
              onPress={handleNextExercise}
              variant="secondary"
              size="lg"
              style={{ marginTop: 8 }}
            />
          )
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

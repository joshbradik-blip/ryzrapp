import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { useWorkoutStore } from '../../store/workoutStore';
import { useSubscriptionStore } from '../../store/subscriptionStore';
import { useProfileStore } from '../../store/profileStore';
import { useHistoryStore } from '../../store/historyStore';
import { useAuthStore } from '../../store/authStore';
import { useWearablesStore } from '../../store/wearablesStore';
import { ChallengeInput } from '../../lib/anthropic';
import { kgToDisplay, displayToKg, WeightUnit } from '../../lib/units';
import { scheduleRestOverNotification, cancelNotification } from '../../lib/notifications';
import { Button } from '../../components/ui/Button';
import { GradientButton } from '../../components/ui/GradientButton';
import { Colors } from '../../constants/theme';
import { haptic } from '../../lib/feedback';
import { supportsFormCoach } from '../../lib/pose/coverage';

type Props = NativeStackScreenProps<TodayStackParamList, 'WorkoutSession'>;

interface LoggedSet {
  weightKg: number;
  reps: number;
}

function fmtWeight(kg: number, unit: WeightUnit): string {
  const n = kgToDisplay(kg, unit);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function WorkoutSessionScreen({ navigation, route }: Props) {
  const { workoutId } = route.params;
  const { workouts, todayWorkout, startSession, logSet, nextExercise, currentExerciseIndex, completeSession, exerciseChallenges, challengesLoading, loadChallenges } = useWorkoutStore();
  const { isPremium } = useSubscriptionStore();
  const { profile, setProfile } = useProfileStore();
  const { lastSets, bestWeights, lastSessionPerf } = useHistoryStore();
  const userId = useAuthStore((s) => s.session?.user?.id);

  const workout = workouts.find((w) => w.id === workoutId) ?? todayWorkout;

  const [setIndex, setSetIndex] = useState(0);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [restActive, setRestActive] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const [restTotal, setRestTotal] = useState(0);
  const [completedSets, setCompletedSets] = useState<Record<string, LoggedSet[]>>({});
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Wall-clock end of the current rest — remaining time is derived from this,
  // so the timer stays correct after the app is backgrounded.
  const restEndRef = useRef(0);
  const restNotifIdRef = useRef<string | null>(null);

  const clearRestNotification = () => {
    cancelNotification(restNotifIdRef.current);
    restNotifIdRef.current = null;
  };

  const currentExercise = workout?.exercises[currentExerciseIndex];
  const isLastExercise = workout && currentExerciseIndex >= workout.exercises.length - 1;

  useEffect(() => {
    if (!workout) return;
    startSession(workout.id);
    if (!isPremium) return;

    (async () => {
      const hist = useHistoryStore.getState();
      if (!hist.loaded && userId) await hist.fetchHistory(userId);
      const fresh = useHistoryStore.getState();
      const u = useProfileStore.getState().profile?.weight_unit ?? 'lbs';
      const inputs: ChallengeInput[] = workout.exercises.map((we) => {
        const id = we.exercise.id;
        const ls = fresh.lastSessionPerf[id];
        const b = fresh.bestWeights[id];
        return {
          exerciseId: id,
          name: we.exercise.name,
          lastSession: ls ? ls.sets.map((s) => ({ weight: kgToDisplay(s.weight_kg, u), reps: s.reps })) : null,
          best: b ? kgToDisplay(b.weight_kg, u) : null,
          targetSets: we.target_sets,
          targetReps: we.target_reps,
        };
      });
      loadChallenges(inputs, {
        name: useProfileStore.getState().profile?.name ?? 'Athlete',
        unit: u,
        readiness: useWearablesStore.getState().readiness,
      });
    })();
  }, []);

  useEffect(() => {
    if (restActive) {
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((restEndRef.current - Date.now()) / 1000));
        setRestRemaining((prev) => {
          if (remaining <= 0) {
            clearInterval(timerRef.current!);
            setRestActive(false);
            clearRestNotification(); // finished in-app — banner not needed
            haptic.success();
            return 0;
          }
          if (remaining <= 4 && remaining < prev) haptic.impact('light');
          return remaining;
        });
      }, 500);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [restActive]);

  // Leaving the session screen entirely — drop any pending rest alert.
  useEffect(() => () => clearRestNotification(), []);

  if (!workout || !currentExercise) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.text, fontSize: 18 }}>No workout found.</Text>
      </SafeAreaView>
    );
  }

  const unit: WeightUnit = profile?.weight_unit ?? 'lbs';
  const exId = currentExercise.exercise.id;
  const logged = completedSets[currentExercise.id] ?? [];
  const completedCount = logged.length;

  const last = lastSets[exId];
  const best = bestWeights[exId];
  const enteredKg = displayToKg(parseFloat(weight) || 0, unit);
  const prDeltaKg = best && enteredKg > best.weight_kg ? enteredKg - best.weight_kg : 0;

  const lastSession = lastSessionPerf[exId];
  const recallText = lastSession && lastSession.sets.length > 0
    ? lastSession.sets.map((s) => `${fmtWeight(s.weight_kg, unit)}×${s.reps}`).join(', ')
    : null;
  const challengeText = exerciseChallenges[exId];

  const handleLogSet = () => {
    if (!reps) return;
    haptic.impact('medium');
    const weightKg = displayToKg(parseFloat(weight) || 0, unit);
    logSet({
      workoutExerciseId: currentExercise.id,
      setNumber: setIndex + 1,
      reps: parseInt(reps, 10),
      weight: parseFloat(weight) || 0,
    });

    const key = currentExercise.id;
    const newSets = [...(completedSets[key] ?? []), { weightKg, reps: parseInt(reps, 10) }];
    setCompletedSets((prev) => ({ ...prev, [key]: newSets }));

    const restSecs = currentExercise.rest_seconds || 90;
    setRestTotal(restSecs);
    setRestRemaining(restSecs);
    restEndRef.current = Date.now() + restSecs * 1000;
    setRestActive(true);
    setReps('');
    // If the user backgrounds the app mid-rest, a local notification calls
    // them back; it's suppressed while the app stays foregrounded.
    clearRestNotification();
    if (newSets.length < currentExercise.target_sets) {
      scheduleRestOverNotification(restSecs, currentExercise.exercise.name, newSets.length + 1)
        .then((id) => { restNotifIdRef.current = id; });
    }

    if (newSets.length < currentExercise.target_sets) {
      setSetIndex((i) => i + 1);
    }
  };

  const handleNextExercise = () => {
    setRestActive(false);
    clearRestNotification();
    setSetIndex(0);
    setWeight('');
    setReps('');
    if (timerRef.current) clearInterval(timerRef.current);
    nextExercise();
  };

  const handleSkipRemainingSets = () => {
    const remaining = currentExercise.target_sets - completedCount;
    if (remaining <= 0) {
      handleNextExercise();
      return;
    }
    Alert.alert(
      'Skip remaining sets?',
      `You still have ${remaining} set${remaining === 1 ? '' : 's'} left of ${currentExercise.exercise.name}. Move on to the next exercise?`,
      [
        { text: 'Stay', style: 'cancel' },
        { text: 'Skip', style: 'destructive', onPress: handleNextExercise },
      ],
    );
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

  const adjustWeight = (delta: number) =>
    setWeight((w) => String(Math.max(0, Math.round(((parseFloat(w) || 0) + delta) * 10) / 10)));
  const adjustReps = (delta: number) =>
    setReps((r) => String(Math.max(0, (parseInt(r, 10) || 0) + delta)));

  const exerciseProgress = `${currentExerciseIndex + 1}/${workout.exercises.length}`;
  const restPct = restTotal > 0 ? Math.min(1, restRemaining / restTotal) : 0;
  const restClock = `${Math.floor(restRemaining / 60)}:${String(restRemaining % 60).padStart(2, '0')}`;

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
          <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1 }}>
            EXERCISE {exerciseProgress}
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('ExerciseDetail', {
              exerciseId: currentExercise.exercise.id,
              workoutId,
              workoutExerciseId: currentExercise.id,
            })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="play-circle-outline" size={15} color={Colors.primary} />
            <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>Demo</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '900', marginBottom: 4 }}>
          {currentExercise.exercise.name}
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 20 }}>
          {currentExercise.target_sets} sets × {currentExercise.target_reps}
          {currentExercise.target_rpe > 0 ? ` · RPE ${currentExercise.target_rpe}` : ''}
        </Text>

        {/* COACH card */}
        {isPremium ? (
          <View style={{ backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + '33', padding: 14, marginBottom: 20 }}>
            <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 }}>COACH</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: (challengeText || challengesLoading) ? 8 : 0 }}>
              <Ionicons name="time-outline" size={15} color={Colors.textSecondary} />
              <Text style={{ color: Colors.textSecondary, fontSize: 13, flex: 1 }}>
                {recallText ? `Last time: ${recallText}` : 'First time — set your baseline.'}
              </Text>
            </View>
            {challengesLoading && !challengeText ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="barbell-outline" size={15} color={Colors.muted} />
                <Text style={{ color: Colors.muted, fontSize: 13, fontStyle: 'italic', flex: 1 }}>Coach is reviewing your last session…</Text>
              </View>
            ) : challengeText ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flame" size={15} color={Colors.primary} />
                <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{challengeText}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => Alert.alert('Premium Feature', 'Upgrade to RYZR Premium to unlock AI challenges that push you past last time.')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary + '44', padding: 12, marginBottom: 20 }}
          >
            <Ionicons name="lock-closed-outline" size={16} color={Colors.primary} />
            <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>Unlock AI challenges with Premium</Text>
          </TouchableOpacity>
        )}

        {/* Set pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          {Array.from({ length: currentExercise.target_sets }).map((_, i) => {
            const done = logged[i];
            const isCurrent = i === completedCount;
            return (
              <View
                key={i}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 10,
                  borderWidth: 1,
                  backgroundColor: done ? Colors.primary + '22' : Colors.surface2,
                  borderColor: done || isCurrent ? Colors.primary : Colors.border,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Text style={{ color: done ? Colors.primary : isCurrent ? Colors.text : Colors.muted, fontSize: 12, fontWeight: '700' }}>
                  {done ? `${fmtWeight(done.weightKg, unit)}×${done.reps}` : `SET ${i + 1}`}
                </Text>
                {done && <Ionicons name="checkmark" size={12} color={Colors.primary} />}
              </View>
            );
          })}
        </View>

        {/* Big-number stage */}
        <View style={{ backgroundColor: Colors.surface, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 16, marginBottom: 16 }}>
          <View style={{ flexDirection: 'row' }}>
            {/* Weight column */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>WEIGHT</Text>
                <View style={{ flexDirection: 'row', backgroundColor: Colors.surface2, borderRadius: 6, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden' }}>
                  {(['kg', 'lbs'] as WeightUnit[]).map((u) => {
                    const active = unit === u;
                    return (
                      <TouchableOpacity
                        key={u}
                        onPress={() => {
                          if (active) return;
                          const current = parseFloat(weight) || 0;
                          if (current > 0) setWeight(String(kgToDisplay(displayToKg(current, unit), u)));
                          setProfile({ weight_unit: u });
                        }}
                        style={{ paddingHorizontal: 8, paddingVertical: 3, backgroundColor: active ? Colors.primary : 'transparent' }}
                      >
                        <Text style={{ fontSize: 10, fontWeight: '700', color: active ? Colors.onPrimary : Colors.muted }}>{u.toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity onPress={() => adjustWeight(-2.5)} hitSlop={8} style={stepperStyle}>
                  <Text style={stepperText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.muted}
                  style={{ minWidth: 56, color: Colors.text, fontSize: 34, fontWeight: '900', textAlign: 'center' }}
                />
                <TouchableOpacity onPress={() => adjustWeight(2.5)} hitSlop={8} style={stepperStyle}>
                  <Text style={[stepperText, { color: Colors.primary }]}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 6 }}>
                {last ? `last ${fmtWeight(last.weight_kg, unit)}` : ' '}
              </Text>
            </View>

            {/* Divider */}
            <View style={{ width: 1, backgroundColor: Colors.border, marginHorizontal: 6 }} />

            {/* Reps column */}
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginTop: 4 }}>REPS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TouchableOpacity onPress={() => adjustReps(-1)} hitSlop={8} style={stepperStyle}>
                  <Text style={stepperText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  value={reps}
                  onChangeText={setReps}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.muted}
                  style={{ minWidth: 48, color: Colors.text, fontSize: 34, fontWeight: '900', textAlign: 'center' }}
                />
                <TouchableOpacity onPress={() => adjustReps(1)} hitSlop={8} style={stepperStyle}>
                  <Text style={[stepperText, { color: Colors.primary }]}>+</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 6 }}>
                {last ? `last ${last.reps}` : ' '}
              </Text>
            </View>
          </View>
        </View>

        {/* Inline rest bar */}
        {restActive && (
          <View style={{ backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="hourglass-outline" size={20} color={Colors.primary} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>REST</Text>
                <Text style={{ color: Colors.primary, fontSize: 16, fontWeight: '800' }}>{restClock}</Text>
              </View>
              <View style={{ height: 4, backgroundColor: Colors.surface3, borderRadius: 2 }}>
                <View style={{ height: 4, width: `${restPct * 100}%`, backgroundColor: Colors.primary, borderRadius: 2 }} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={() => { restEndRef.current -= 15000; setRestRemaining((r) => Math.max(0, r - 15)); }} style={restBtn}>
                <Text style={restBtnText}>−15</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setRestActive(false); clearRestNotification(); if (timerRef.current) clearInterval(timerRef.current); }} style={restBtn}>
                <Text style={restBtnText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { restEndRef.current += 15000; setRestRemaining((r) => r + 15); }} style={restBtn}>
                <Text style={restBtnText}>+15</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Log set */}
        <GradientButton title="Log Set" icon="flash" onPress={handleLogSet} disabled={!reps} style={{ marginBottom: prDeltaKg > 0 ? 8 : 12 }} />
        {prDeltaKg > 0 && (
          <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 12 }}>
            🔥 {fmtWeight(prDeltaKg, unit)} {unit} over your best — PR pace
          </Text>
        )}

        {/* Completed-set ledger */}
        {logged.length > 0 && (
          <View style={{ gap: 6, marginBottom: 12 }}>
            {logged.map((s, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.surface, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, opacity: 0.7 }}>
                <Text style={{ color: Colors.textSecondary, fontSize: 13, fontWeight: '600' }}>Set {i + 1}</Text>
                <Text style={{ color: Colors.text, fontSize: 14 }}>{fmtWeight(s.weightKg, unit)} {unit} × {s.reps}</Text>
                <Ionicons name="checkmark-circle" size={16} color={Colors.primary} />
              </View>
            ))}
          </View>
        )}

        {/* Form coach (premium) — hidden on mobility work the pipeline cannot score. */}
        {supportsFormCoach(currentExercise.exercise) && (
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
        )}

        {/* Skip remaining sets (mid-exercise) */}
        {completedCount < currentExercise.target_sets && !isLastExercise && (
          <TouchableOpacity
            onPress={handleSkipRemainingSets}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 13,
              marginBottom: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: Colors.border,
              backgroundColor: Colors.surface2,
            }}
          >
            <Ionicons name="play-skip-forward-outline" size={17} color={Colors.textSecondary} />
            <Text style={{ color: Colors.textSecondary, fontSize: 15, fontWeight: '700' }}>
              Skip to next exercise
            </Text>
          </TouchableOpacity>
        )}

        {/* Next exercise / Finish */}
        {completedCount >= currentExercise.target_sets && (
          isLastExercise ? (
            <GradientButton title="Finish Workout" icon="trophy" onPress={handleFinish} style={{ marginTop: 8 }} />
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

const stepperStyle = {
  width: 40,
  height: 48,
  backgroundColor: Colors.surface2,
  borderRadius: 10,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  borderWidth: 1,
  borderColor: Colors.border,
};

const stepperText = { color: Colors.text, fontSize: 24, fontWeight: '700' as const };

const restBtn = {
  paddingHorizontal: 10,
  paddingVertical: 8,
  backgroundColor: Colors.surface3,
  borderRadius: 8,
};

const restBtnText = { color: Colors.text, fontWeight: '600' as const, fontSize: 12 };

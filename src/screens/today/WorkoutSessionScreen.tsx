import { trackEvent } from '../../lib/funnel';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
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
import { exerciseHeroMedia } from '../../lib/exerciseMedia';
import { Button } from '../../components/ui/Button';
import { GradientButton } from '../../components/ui/GradientButton';
import { ExerciseHero } from '../../components/workout/ExerciseHero';
import { Colors } from '../../constants/theme';
import { haptic } from '../../lib/feedback';
import { supportsFormCoach } from '../../lib/pose/coverage';
import { useFormCoachEnabled } from '../../lib/featureFlags';
import { WorkoutRestScreen } from './WorkoutRestScreen';

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
  const isFocused = useIsFocused();
  const formCoachEnabled = useFormCoachEnabled();
  const { workoutId } = route.params;
  const { workouts, todayWorkout, programWorkout, startSession, logSet, nextExercise, currentExerciseIndex, completeSession, exerciseChallenges, challengesLoading, loadChallenges } = useWorkoutStore();
  const { isPremium } = useSubscriptionStore();
  const { profile, setProfile } = useProfileStore();
  const { lastSets, bestWeights, lastSessionPerf } = useHistoryStore();
  const userId = useAuthStore((s) => s.session?.user?.id);

  // A predesigned program lives outside `workouts` so starting one never
  // disturbs the plan, so check it before falling back to today's workout.
  const workout =
    workouts.find((w) => w.id === workoutId) ??
    (programWorkout && programWorkout.id === workoutId ? programWorkout : null) ??
    todayWorkout;

  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [resting, setResting] = useState(false);
  const [completedSets, setCompletedSets] = useState<Record<string, LoggedSet[]>>({});
  const scrollRef = useRef<ScrollView>(null);
  const endRest = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    setResting(false);
  }, []);

  const currentExercise = workout?.exercises[currentExerciseIndex];
  const isLastExercise = workout && currentExerciseIndex >= workout.exercises.length - 1;

  useEffect(() => {
    if (!workout) return;
    startSession(workout.id);
    trackEvent('workout_started', { workout_id: workout.id });
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

  if (!workout || !currentExercise) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.text, fontSize: 18 }}>No workout found.</Text>
      </SafeAreaView>
    );
  }

  const unit: WeightUnit = profile?.weight_unit ?? 'lbs';
  const { exercise } = currentExercise;
  const exId = exercise.id;
  const logged = completedSets[currentExercise.id] ?? [];
  const completedCount = logged.length;
  const hasSetToLog = completedCount < currentExercise.target_sets;

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
    if (!reps || !hasSetToLog || resting) return;
    const setNumber = completedCount + 1;
    // A second tap before the logger re-renders must not save the same set twice.
    if (useWorkoutStore.getState().activeSets.some(
      (set) => set.workoutExerciseId === currentExercise.id && set.setNumber === setNumber,
    )) return;

    Keyboard.dismiss();
    haptic.impact('medium');
    const weightKg = displayToKg(parseFloat(weight) || 0, unit);
    logSet({
      workoutExerciseId: currentExercise.id,
      setNumber,
      reps: parseInt(reps, 10),
      weight: parseFloat(weight) || 0,
    });

    const key = currentExercise.id;
    const newSets = [...(completedSets[key] ?? []), { weightKg, reps: parseInt(reps, 10) }];
    setCompletedSets((prev) => ({ ...prev, [key]: newSets }));

    setReps('');
    if (newSets.length < currentExercise.target_sets) {
      setResting(true);
    } else if (!isLastExercise) {
      handleNextExercise();
    }
  };

  const handleNextExercise = () => {
    setWeight('');
    setReps('');
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

      <ScrollView
        key={`${currentExercise.id}:${exId}`}
        ref={scrollRef}
        contentContainerStyle={{ flexGrow: 1, padding: 24 }}
        keyboardShouldPersistTaps="handled"
      >
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
              exercise,
            })}
            accessibilityRole="button"
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 }}
          >
            <Ionicons name="information-circle-outline" size={15} color={Colors.primary} />
            <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>Exercise details</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: Colors.text, fontSize: 28, fontWeight: '900', marginBottom: 4 }}>
          {currentExercise.exercise.name}
        </Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 12 }}>
          {currentExercise.target_sets} sets × {currentExercise.target_reps}
          {currentExercise.target_rpe > 0 ? ` · RPE ${currentExercise.target_rpe}` : ''}
        </Text>

        <View style={{ borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          <ExerciseHero
            name={exercise.name}
            {...exerciseHeroMedia(exercise)}
            muscles={exercise.muscles_primary}
            cues={[...exercise.setup_cues, ...exercise.execution_cues]}
            height={168}
            fit="contain"
            active={isFocused && !resting}
          />
        </View>

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
                  {done ? `${fmtWeight(done.weightKg, unit)} ${unit} × ${done.reps}` : `SET ${i + 1}`}
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

        {/* Log set */}
        <GradientButton title="Log Set" icon="flash" onPress={handleLogSet} disabled={!reps || !hasSetToLog} style={{ marginBottom: prDeltaKg > 0 ? 8 : 12 }} />
        {prDeltaKg > 0 && (
          <Text style={{ color: Colors.primary, fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 12 }}>
            🔥 {fmtWeight(prDeltaKg, unit)} {unit} over your best — PR pace
          </Text>
        )}

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

        {/* Form coach (premium) — hidden on mobility work the pipeline cannot score. */}
        {formCoachEnabled && supportsFormCoach(currentExercise.exercise) && (
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
      {resting && (
        <WorkoutRestScreen
          durationSeconds={currentExercise.rest_seconds || 90}
          exerciseName={exercise.name}
          nextSet={completedCount + 1}
          onDone={endRest}
        />
      )}
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

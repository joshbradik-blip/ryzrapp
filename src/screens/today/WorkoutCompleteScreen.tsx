import React, { useEffect, useMemo, useRef } from 'react';
import { View, Text, Animated, TouchableOpacity, Share, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList } from '../../types';
import { useWorkoutStore } from '../../store/workoutStore';
import { useProfileStore } from '../../store/profileStore';
import { useHistoryStore } from '../../store/historyStore';
import { displayToKg, kgToDisplay, weightLabel } from '../../lib/units';
import { Colors } from '../../constants/theme';
import { haptic } from '../../lib/feedback';

type Props = NativeStackScreenProps<TodayStackParamList, 'WorkoutComplete'>;

interface SessionPR {
  exerciseName: string;
  weightDisplay: number; // display unit
  reps: number;
  prevBestDisplay: number | null; // null = first record for this exercise
}

export function WorkoutCompleteScreen({ navigation }: Props) {
  const { activeSession, activeSets, workouts, todayWorkout, reset, advanceWorkout, saveSession } = useWorkoutStore();
  const { profile } = useProfileStore();
  const scaleAnim = useRef(new Animated.Value(0.3)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const unit = profile?.weight_unit ?? 'kg';
  const totalVolume = activeSets.reduce((acc, s) => acc + s.reps * s.weight, 0);
  const totalSets = activeSets.length;
  const duration = activeSession?.started_at
    ? Math.round((Date.now() - new Date(activeSession.started_at).getTime()) / 60000)
    : 0;

  // PRs set this session: heaviest set per exercise vs the all-time best from
  // history. Computed on mount, BEFORE saveSession refreshes history — so
  // bestWeights still reflects "before today".
  const prs = useMemo<SessionPR[]>(() => {
    if (!todayWorkout) return [];
    const bestWeights = useHistoryStore.getState().bestWeights;
    const bestBySession = new Map<string, { weightDisplay: number; reps: number }>();
    for (const s of activeSets) {
      if (s.weight <= 0) continue;
      const cur = bestBySession.get(s.workoutExerciseId);
      if (!cur || s.weight > cur.weightDisplay) {
        bestBySession.set(s.workoutExerciseId, { weightDisplay: s.weight, reps: s.reps });
      }
    }
    const out: SessionPR[] = [];
    for (const [weId, best] of bestBySession) {
      const we = todayWorkout.exercises.find((e) => e.id === weId);
      if (!we) continue;
      const bestKg = displayToKg(best.weightDisplay, unit);
      const prev = bestWeights[we.exercise.id];
      if (!prev) {
        out.push({ exerciseName: we.exercise.name, weightDisplay: best.weightDisplay, reps: best.reps, prevBestDisplay: null });
      } else if (bestKg > prev.weight_kg + 0.01) {
        out.push({
          exerciseName: we.exercise.name,
          weightDisplay: best.weightDisplay,
          reps: best.reps,
          prevBestDisplay: kgToDisplay(prev.weight_kg, unit),
        });
      }
    }
    // Beaten records first (they're the headline), then first-time records.
    return out
      .sort((a, b) => (a.prevBestDisplay === null ? 1 : 0) - (b.prevBestDisplay === null ? 1 : 0))
      .slice(0, 3);
  }, []);

  const beatenPRs = prs.filter((p) => p.prevBestDisplay !== null);

  useEffect(() => {
    haptic.success();
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 60, friction: 5 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      if (beatenPRs.length > 0) haptic.success();
    });
  }, []);

  const handleShare = async () => {
    const lines = [
      `🔥 Crushed "${todayWorkout?.name ?? 'a workout'}" on RYZR`,
      `⏱ ${duration} min · ${totalSets} sets · ${Math.round(totalVolume).toLocaleString()} ${weightLabel(unit)} moved`,
      ...prs.map((p) =>
        p.prevBestDisplay !== null
          ? `🏆 New PR: ${p.exerciseName} ${p.weightDisplay} ${weightLabel(unit)} × ${p.reps} (was ${p.prevBestDisplay})`
          : `🎯 First record: ${p.exerciseName} ${p.weightDisplay} ${weightLabel(unit)} × ${p.reps}`
      ),
    ];
    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      // user dismissed the share sheet — nothing to do
    }
  };

  const handleDone = () => {
    saveSession(profile?.weight_unit ?? 'kg'); // fire and forget — reads state before reset clears it
    advanceWorkout();
    reset();
    navigation.navigate('TodayHome');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>

        {/* Trophy animation */}
        <Animated.View style={{ transform: [{ scale: scaleAnim }], marginBottom: 28 }}>
          <View style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: Colors.primary + '22',
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: Colors.primary,
            shadowColor: Colors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 30,
            elevation: 12,
          }}>
            <Ionicons name="trophy" size={56} color={Colors.primary} />
          </View>
        </Animated.View>

        <Animated.View style={{ opacity: opacityAnim, alignItems: 'center', width: '100%' }}>
          <Text style={{ color: Colors.primary, fontSize: 14, fontWeight: '700', letterSpacing: 2, marginBottom: 8 }}>
            {beatenPRs.length > 0 ? `${beatenPRs.length} NEW PR${beatenPRs.length > 1 ? 'S' : ''} 🎉` : 'WORKOUT COMPLETE'}
          </Text>
          <Text style={{ color: Colors.text, fontSize: 34, fontWeight: '900', textAlign: 'center', marginBottom: 8 }}>
            {todayWorkout?.name ?? 'Great session!'}
          </Text>
          <Text style={{ color: Colors.textSecondary, fontSize: 16, marginBottom: 32, textAlign: 'center' }}>
            {beatenPRs.length > 0 ? 'You just rewrote your record book.' : "You showed up. That's what matters."}
          </Text>

          {/* Stats row */}
          <View style={{ flexDirection: 'row', gap: 12, width: '100%', marginBottom: 20 }}>
            {[
              { label: 'Duration', value: `${duration}`, unit: 'min' },
              { label: 'Total sets', value: String(totalSets), unit: 'sets' },
              { label: 'Volume', value: totalVolume > 0 ? String(Math.round(totalVolume)) : '—', unit: totalVolume > 0 ? weightLabel(unit) : '' },
            ].map((stat) => (
              <View key={stat.label} style={{
                flex: 1,
                backgroundColor: Colors.surface,
                borderRadius: 14,
                padding: 14,
                alignItems: 'center',
                borderWidth: 1,
                borderColor: Colors.border,
              }}>
                <Text style={{ color: Colors.primary, fontSize: 24, fontWeight: '900' }}>{stat.value}</Text>
                <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '600' }}>{stat.unit}</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 11, marginTop: 2 }}>{stat.label}</Text>
              </View>
            ))}
          </View>

          {/* PR cards */}
          {prs.length > 0 && (
            <View style={{ width: '100%', gap: 10, marginBottom: 20 }}>
              {prs.map((p) => (
                <View key={p.exerciseName} style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: Colors.primary + '18',
                  borderRadius: 14,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: Colors.primary + '66',
                }}>
                  <Ionicons name={p.prevBestDisplay !== null ? 'trophy' : 'flag'} size={22} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 15 }}>{p.exerciseName}</Text>
                    <Text style={{ color: Colors.textSecondary, fontSize: 12, marginTop: 1 }}>
                      {p.prevBestDisplay !== null
                        ? `New PR — previous best ${p.prevBestDisplay} ${weightLabel(unit)}`
                        : 'First record set'}
                    </Text>
                  </View>
                  <Text style={{ color: Colors.primary, fontWeight: '900', fontSize: 17 }}>
                    {p.weightDisplay} {weightLabel(unit)} × {p.reps}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Completion banner (only when there are no PRs to celebrate) */}
          {prs.length === 0 && (
            <View style={{
              backgroundColor: Colors.primary + '22',
              borderRadius: 16,
              padding: 16,
              width: '100%',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 14,
              marginBottom: 20,
              borderWidth: 1,
              borderColor: Colors.primary + '44',
            }}>
              <Ionicons name="flame" size={36} color={Colors.primary} />
              <View>
                <Text style={{ color: Colors.primary, fontWeight: '900', fontSize: 18 }}>Session complete!</Text>
                <Text style={{ color: Colors.textSecondary, fontSize: 13 }}>Keep it going — train again tomorrow</Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            onPress={handleShare}
            style={{ backgroundColor: Colors.surface, borderRadius: 14, paddingVertical: 15, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 }}
          >
            <Ionicons name="share-outline" size={20} color={Colors.primary} />
            <Text style={{ color: Colors.text, fontWeight: '800', fontSize: 16 }}>Share workout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleDone}
            style={{ backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 18, width: '100%', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }}
          >
            <Text style={{ color: '#000', fontWeight: '900', fontSize: 18 }}>Done</Text>
            <Ionicons name="checkmark-circle" size={22} color="#000" />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

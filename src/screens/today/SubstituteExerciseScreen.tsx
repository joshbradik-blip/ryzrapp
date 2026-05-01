import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  ActionSheetIOS,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { TodayStackParamList, SubstituteOption } from '../../types';
import { getExerciseById } from '../../constants/exercises';
import { findSubstitutes, SubstituteResults } from '../../utils/substitutions';
import { useWorkoutStore } from '../../store/workoutStore';
import { useProfileStore } from '../../store/profileStore';
import { Colors } from '../../constants/theme';

type Props = NativeStackScreenProps<TodayStackParamList, 'SubstituteExercise'>;

const DIFFICULTY_COLOR: Record<string, string> = {
  beginner:     '#44FF88',
  intermediate: '#FFD644',
  advanced:     '#FF4444',
};

export function SubstituteExerciseScreen({ navigation, route }: Props) {
  const { exerciseId, workoutId, workoutExerciseId } = route.params;
  const exercise = getExerciseById(exerciseId);
  const { swapForSession, swapForPlan } = useWorkoutStore();
  const { profile } = useProfileStore();

  const [results, setResults] = useState<SubstituteResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userEquipment: string[] = (profile as any)?.equipment ?? [];
  const userInjuries: string[] = (profile as any)?.injuries ?? [];

  useEffect(() => {
    if (!exercise) return;
    findSubstitutes(exercise, userEquipment, userInjuries)
      .then(setResults)
      .catch(() => setError('Could not load substitutes. Check your connection.'))
      .finally(() => setLoading(false));
  }, [exerciseId]);

  const handleSelect = useCallback((option: SubstituteOption) => {
    const replacement = option.source === 'local' ? option.localExercise! : option.dbExercise!;

    const confirm = (scope: 'session' | 'plan') => {
      if (scope === 'session') {
        swapForSession(workoutId, workoutExerciseId, replacement, option.source);
      } else {
        swapForPlan(workoutId, workoutExerciseId, exerciseId, replacement, option.source);
      }
      // Pop back to ExerciseDetail, then back to the workout
      navigation.pop(2);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: `Swap to ${option.name}`,
          options: ['Cancel', 'Just for today', 'Always use this instead'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: undefined,
        },
        (index) => {
          if (index === 1) confirm('session');
          if (index === 2) confirm('plan');
        }
      );
    } else {
      Alert.alert(
        `Swap to ${option.name}`,
        'How long should this swap last?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Just for today', onPress: () => confirm('session') },
          { text: 'Always use this instead', onPress: () => confirm('plan') },
        ]
      );
    }
  }, [workoutId, workoutExerciseId, exerciseId, swapForSession, swapForPlan, navigation]);

  if (!exercise) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: Colors.text }}>Exercise not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Header */}
      <View style={{ padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border }}>
        <Text style={{ color: Colors.muted, fontSize: 12, fontWeight: '600', letterSpacing: 1, marginBottom: 4 }}>
          SWAPPING OUT
        </Text>
        <Text style={{ color: Colors.primary, fontSize: 22, fontWeight: '900' }}>
          {exercise.name.toUpperCase()}
        </Text>
      </View>

      {loading && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ color: Colors.muted, fontSize: 14 }}>Finding alternatives…</Text>
        </View>
      )}

      {error && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="wifi-outline" size={40} color={Colors.muted} />
          <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '700', marginTop: 12 }}>
            Connection error
          </Text>
          <Text style={{ color: Colors.muted, fontSize: 14, textAlign: 'center', marginTop: 6 }}>
            {error}
          </Text>
        </View>
      )}

      {!loading && !error && results && (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>

          {/* Equipment info banner */}
          <View style={{
            backgroundColor: Colors.primary + '11',
            borderRadius: 12,
            padding: 14,
            marginBottom: 20,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderWidth: 1,
            borderColor: Colors.primary + '33',
          }}>
            <Ionicons name="flash-outline" size={18} color={Colors.primary} />
            <Text style={{ color: Colors.textSecondary, fontSize: 13, flex: 1, lineHeight: 18 }}>
              Compatible alternatives shown first. Tap any to choose{' '}
              <Text style={{ color: Colors.text, fontWeight: '700' }}>just for today</Text>
              {' '}or{' '}
              <Text style={{ color: Colors.text, fontWeight: '700' }}>save to your plan</Text>.
            </Text>
          </View>

          {/* Compatible section */}
          {results.compatible.length > 0 && (
            <>
              <SectionHeader
                label="WORKS WITH YOUR EQUIPMENT"
                color={Colors.primary}
                count={results.compatible.length}
              />
              {results.compatible.map((opt) => (
                <SubstituteCard key={opt.id} option={opt} onSelect={handleSelect} />
              ))}
            </>
          )}

          {/* Incompatible section */}
          {results.incompatible.length > 0 && (
            <>
              <SectionHeader
                label="REQUIRES OTHER EQUIPMENT"
                color={Colors.muted}
                count={results.incompatible.length}
                style={{ marginTop: results.compatible.length > 0 ? 20 : 0 }}
              />
              {results.incompatible.map((opt) => (
                <SubstituteCard key={opt.id} option={opt} onSelect={handleSelect} dimmed />
              ))}
            </>
          )}

          {results.compatible.length === 0 && results.incompatible.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Ionicons name="search-outline" size={40} color={Colors.muted} />
              <Text style={{ color: Colors.muted, fontSize: 15, marginTop: 12 }}>
                No alternatives found for this exercise.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SectionHeader({
  label, color, count, style,
}: {
  label: string;
  color: string;
  count: number;
  style?: object;
}) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }, style]}>
      <Text style={{ color, fontSize: 11, fontWeight: '800', letterSpacing: 1 }}>{label}</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: color + '33' }} />
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{count}</Text>
    </View>
  );
}

function SubstituteCard({
  option,
  onSelect,
  dimmed = false,
}: {
  option: SubstituteOption;
  onSelect: (opt: SubstituteOption) => void;
  dimmed?: boolean;
}) {
  const diffColor = DIFFICULTY_COLOR[option.difficulty] ?? Colors.muted;

  return (
    <TouchableOpacity
      onPress={() => !dimmed && onSelect(option)}
      activeOpacity={dimmed ? 1 : 0.7}
      style={{
        backgroundColor: Colors.surface,
        borderRadius: 14,
        padding: 16,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: option.isEquipmentCompatible ? Colors.border : Colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        opacity: dimmed ? 0.45 : 1,
      }}
    >
      {/* Source badge */}
      <View style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: option.isEquipmentCompatible ? Colors.primary + '22' : Colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Ionicons
          name={option.isEquipmentCompatible ? 'checkmark-circle' : 'lock-closed-outline'}
          size={18}
          color={option.isEquipmentCompatible ? Colors.primary : Colors.muted}
        />
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ color: Colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 }}>
          {option.name}
        </Text>
        <Text style={{ color: Colors.muted, fontSize: 12, marginBottom: 4 }} numberOfLines={1}>
          {option.muscles}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{
            paddingHorizontal: 7,
            paddingVertical: 2,
            borderRadius: 6,
            backgroundColor: diffColor + '22',
            borderWidth: 1,
            borderColor: diffColor + '55',
          }}>
            <Text style={{ color: diffColor, fontSize: 10, fontWeight: '700', textTransform: 'capitalize' }}>
              {option.difficulty}
            </Text>
          </View>
          <Text style={{ color: Colors.muted, fontSize: 11 }}>{option.equipment}</Text>
          {option.source === 'exercisedb' && (
            <View style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: Colors.info + '22',
              borderWidth: 1,
              borderColor: Colors.info + '44',
            }}>
              <Text style={{ color: Colors.info, fontSize: 10, fontWeight: '700' }}>DB</Text>
            </View>
          )}
        </View>
      </View>

      {!dimmed && (
        <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
      )}
    </TouchableOpacity>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { Exercise, TodayStackParamList } from '../../types';
import { EXERCISES } from '../../constants/exercises';
import { searchExercisesByName, exerciseFromDB } from '../../lib/exercisedb';
import { SectionLabel } from '../../components/ui/SectionLabel';
import { Colors, BorderRadius, Spacing } from '../../constants/theme';

// Look up any exercise and read its demo + cues, with no workout in progress.
//
// Before this screen the only way to reach ExerciseDetail was from inside a
// generated workout or the swap flow, so the curated cues were invisible
// unless the AI happened to program that movement.
//
// Two tiers, deliberately not merged into one ranked list:
//   Curated  — the 35 in constants/exercises.ts. Full setup/execution/mistakes
//              cues, a Supabase demo clip, Form Coach support where the pose
//              pipeline covers it.
//   More     — ExerciseDB's long tail. A GIF and flat instructions, no mistakes
//              list. Strictly a fallback, and it degrades to nothing at all
//              when the authenticated catalog service is unavailable.
// Keeping them visually separate sets the expectation that the second tier is
// thinner, rather than burying a curated squat under ten ExerciseDB variants.
// Remote requests go through an Edge Function so the RapidAPI key is never
// embedded in the app bundle.

const DEBOUNCE_MS = 350;
const MIN_REMOTE_QUERY = 3;

type Row = { exercise: Exercise; curated: boolean };

function matchesLocal(ex: Exercise, q: string): boolean {
  if (ex.name.toLowerCase().includes(q)) return true;
  // Searching a muscle or a piece of kit is as natural as searching a name.
  if (ex.muscles_primary.some((m) => m.toLowerCase().includes(q))) return true;
  if (ex.equipment_required.some((e) => e.replace(/_/g, ' ').includes(q))) return true;
  return false;
}

export function ExerciseLibraryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<TodayStackParamList>>();
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<Exercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [catalogError, setCatalogError] = useState(false);

  const q = query.trim().toLowerCase();

  const local = useMemo<Row[]>(() => {
    const list = q ? EXERCISES.filter((ex) => matchesLocal(ex, q)) : EXERCISES;
    return list.map((exercise) => ({ exercise, curated: true }));
  }, [q]);

  // Debounced remote search. The request id guards against out-of-order
  // responses: a slow "squ" landing after a fast "squat" would otherwise
  // overwrite the newer results with staler ones.
  const requestId = useRef(0);
  useEffect(() => {
    if (q.length < MIN_REMOTE_QUERY) {
      setRemote([]);
      setSearching(false);
      setCatalogError(false);
      return;
    }
    const id = ++requestId.current;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchExercisesByName(q);
        if (id !== requestId.current) return;
        const localNames = new Set(EXERCISES.map((e) => e.name.toLowerCase()));
        setRemote(results.filter((r) => !localNames.has(r.name.toLowerCase())).map(exerciseFromDB));
        setCatalogError(false);
      } catch {
        if (id !== requestId.current) return;
        setRemote([]);
        setCatalogError(true);
      } finally {
        if (id === requestId.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [q]);

  const rows = useMemo<Row[]>(
    () => [...local, ...remote.map((exercise) => ({ exercise, curated: false }))],
    [local, remote]
  );

  const open = (row: Row) => {
    Keyboard.dismiss();
    navigation.navigate('ExerciseDetail', {
      exerciseId: row.exercise.id,
      // Curated entries resolve by id; ExerciseDB ones exist only here, so the
      // record has to travel with the navigation.
      exercise: row.curated ? undefined : row.exercise,
    });
  };

  const renderRow = ({ item, index }: { item: Row; index: number }) => {
    const firstRemote = !item.curated && (index === 0 || rows[index - 1].curated);
    return (
      <>
        {firstRemote && (
          <View style={{ marginTop: Spacing.lg, marginBottom: Spacing.sm }}>
            <SectionLabel>More exercises</SectionLabel>
            <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4 }}>
              From our wider database — written steps, no RYZR demo clip.
            </Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => open(item)}
          activeOpacity={0.8}
          accessibilityRole="button"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.md,
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: BorderRadius.md,
            padding: 14,
            marginBottom: Spacing.sm,
          }}
        >
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: BorderRadius.sm,
              backgroundColor: Colors.surface2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={item.curated ? 'barbell' : 'document-text-outline'}
              size={21}
              color={item.curated ? Colors.primary : Colors.muted}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '700' }}>{item.exercise.name}</Text>
            <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
              {item.exercise.muscles_primary.join(' · ')}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={Colors.muted} />
        </TouchableOpacity>
      </>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['bottom']}>
      <View style={{ paddingHorizontal: Spacing.lg, paddingTop: Spacing.md }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: Spacing.sm,
            backgroundColor: Colors.surface,
            borderWidth: 1,
            borderColor: Colors.border,
            borderRadius: BorderRadius.md,
            paddingHorizontal: 14,
          }}
        >
          <Ionicons name="search" size={19} color={Colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search an exercise, muscle or kit"
            placeholderTextColor={Colors.muted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            style={{ flex: 1, color: Colors.text, fontSize: 16, paddingVertical: 13 }}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Clear search" hitSlop={10}>
              <Ionicons name="close-circle" size={19} color={Colors.muted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.exercise.id}
        renderItem={renderRow}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ padding: Spacing.lg, paddingBottom: Spacing.xl }}
        ListHeaderComponent={
          q ? null : (
            <View style={{ marginBottom: Spacing.sm }}>
              <SectionLabel>All exercises</SectionLabel>
              <Text style={{ color: Colors.muted, fontSize: 12, marginTop: 4 }}>
                {EXERCISES.length} with full demos and coaching cues. Search to reach the rest.
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          searching ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md }}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={{ color: Colors.muted, fontSize: 13 }}>Searching more exercises…</Text>
            </View>
          ) : catalogError ? (
            <Text style={{ color: Colors.warning, fontSize: 13, paddingVertical: Spacing.md }}>
              The wider exercise catalog is unavailable. Curated RYZR results are still shown.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          searching ? null : (
            <View style={{ alignItems: 'center', paddingVertical: 56 }}>
              <Ionicons name="search-outline" size={40} color={Colors.muted} />
              <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '700', marginTop: Spacing.md }}>
                No match for “{query.trim()}”
              </Text>
              <Text
                style={{
                  color: Colors.muted,
                  fontSize: 13,
                  marginTop: 6,
                  textAlign: 'center',
                  paddingHorizontal: Spacing.xl,
                }}
              >
                Try a shorter word, or search the muscle you want to train.
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

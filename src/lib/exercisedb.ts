import AsyncStorage from '@react-native-async-storage/async-storage';
import { Exercise, ExerciseDBExercise } from '../types';

const BASE_URL = 'https://exercisedb.p.rapidapi.com';
const API_KEY = process.env.EXPO_PUBLIC_EXERCISEDB_KEY ?? '';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const HEADERS = {
  'x-rapidapi-host': 'exercisedb.p.rapidapi.com',
  'x-rapidapi-key': API_KEY,
  'Content-Type': 'application/json',
};

interface CacheEntry {
  data: ExerciseDBExercise[];
  fetchedAt: number;
}

async function readCache(key: string): Promise<ExerciseDBExercise[] | null> {
  try {
    const raw = await AsyncStorage.getItem(`exercisedb_cache_${key}`);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: ExerciseDBExercise[]): Promise<void> {
  try {
    const entry: CacheEntry = { data, fetchedAt: Date.now() };
    await AsyncStorage.setItem(`exercisedb_cache_${key}`, JSON.stringify(entry));
  } catch {
    // Cache write failure is non-fatal
  }
}

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`ExerciseDB ${res.status}: ${path}`);
  return res.json();
}

// Fetch up to 20 exercises targeting a specific muscle, with caching.
export async function getExercisesByTarget(target: string): Promise<ExerciseDBExercise[]> {
  const cacheKey = `target_${target}`;
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  const data = await fetchJSON<ExerciseDBExercise[]>(
    `/exercises/target/${encodeURIComponent(target)}?limit=20&offset=0`
  );
  await writeCache(cacheKey, data);
  return data;
}

// Fetch exercises by body part, with caching.
export async function getExercisesByBodyPart(bodyPart: string): Promise<ExerciseDBExercise[]> {
  const cacheKey = `bodypart_${bodyPart}`;
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  const data = await fetchJSON<ExerciseDBExercise[]>(
    `/exercises/bodyPart/${encodeURIComponent(bodyPart)}?limit=20&offset=0`
  );
  await writeCache(cacheKey, data);
  return data;
}

// Map our exercise category to ExerciseDB target muscle(s).
export function categoryToTargets(category: string): string[] {
  const map: Record<string, string[]> = {
    lower_body:      ['quads', 'glutes', 'hamstrings'],
    posterior_chain: ['hamstrings', 'glutes'],
    upper_push:      ['pectorals', 'triceps', 'delts'],
    upper_pull:      ['lats', 'upper back', 'biceps'],
    core:            ['abs'],
    power:           ['glutes', 'quads'],
    cardio:          ['cardiovascular system'],
  };
  return map[category] ?? ['quads'];
}

// Map our equipment ids to ExerciseDB equipment strings.
export function mapEquipmentToDB(ourEquipment: string[]): string[] {
  const map: Record<string, string> = {
    barbell:        'barbell',
    dumbbell:       'dumbbell',
    cable_machine:  'cable',
    resistance_band:'resistance band',
    kettlebell:     'kettlebell',
    pull_up_bar:    'body weight',
    bench:          'body weight',
  };
  const result = new Set<string>();
  for (const eq of ourEquipment) {
    if (map[eq]) result.add(map[eq]);
  }
  result.add('body weight'); // always available
  return Array.from(result);
}

// Free-text name search, used by the Exercise Library. ExerciseDB matches on a
// substring of the name, so "press" returns bench/overhead/leg press and so on.
//
// Unlike the by-target and by-bodyPart lookups above, a failure here is not
// worth surfacing as an error: the library always has the curated 35 to show,
// and the long tail is a bonus. A missing EXPO_PUBLIC_EXERCISEDB_KEY, an
// offline phone and a RapidAPI quota error all land in the same place —
// return nothing and let the caller render local results alone.
export async function searchExercisesByName(name: string): Promise<ExerciseDBExercise[]> {
  const q = name.trim().toLowerCase();
  if (!q || !API_KEY) return [];

  const cacheKey = `name_${q}`;
  const cached = await readCache(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON<ExerciseDBExercise[]>(
      `/exercises/name/${encodeURIComponent(q)}?limit=25&offset=0`
    );
    await writeCache(cacheKey, data);
    return data;
  } catch {
    return [];
  }
}

// ExerciseDB record -> our Exercise shape.
//
// Extracted from workoutStore's buildReplacementExercise so the Exercise
// Library and the swap flow agree on the mapping; workoutStore now delegates
// here. The `edb_` id prefix is load-bearing: ExerciseDetail uses it to skip
// looking for a Supabase demo clip, and historyMetrics uses it to exclude
// these from muscle-group stats (they carry no reliable muscle data).
//
// ExerciseDB ships flat `instructions` and no mistakes list, so the first two
// lines become setup and the rest execution, and common_mistakes stays empty —
// consumers must handle an empty cue list rather than assume all three.
export function exerciseFromDB(db: ExerciseDBExercise): Exercise {
  return {
    id: `edb_${db.id}`,
    name: db.name,
    category: db.bodyPart,
    muscles_primary: [db.target],
    muscles_secondary: db.secondaryMuscles ?? [],
    equipment_required: [db.equipment],
    difficulty: (db.difficulty as Exercise['difficulty']) ?? 'intermediate',
    setup_cues: db.instructions.slice(0, 2),
    execution_cues: db.instructions.slice(2),
    common_mistakes: [],
    media_url: db.gifUrl,
    contraindications: [],
  };
}

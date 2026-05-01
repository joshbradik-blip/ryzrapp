import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExerciseDBExercise } from '../types';

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

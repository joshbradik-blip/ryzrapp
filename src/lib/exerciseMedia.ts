import type { Exercise } from '../types';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// Convention: curated exercises have a stylized PNG at exercise-media/{id}.png
// and (optionally) a short looping demo clip at exercise-media/{id}.mp4.
// Media is uploaded to the public Supabase Storage "exercise-media" bucket via the
// dashboard — no app release needed to add or swap art. ExerciseHero resolves
// video → still → branded fallback, so missing files degrade gracefully.
export function exerciseImageUrl(exerciseId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/exercise-media/${exerciseId}.png`;
}

export function exerciseVideoUrl(exerciseId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/exercise-media/${exerciseId}.mp4`;
}

export function exerciseHeroMedia({ id, media_url }: Pick<Exercise, 'id' | 'media_url'>) {
  return {
    mediaUrl: media_url ?? exerciseImageUrl(id),
    videoUrl: id.startsWith('edb_') ? undefined : exerciseVideoUrl(id),
  };
}

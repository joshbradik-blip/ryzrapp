const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// Convention: curated exercises have a stylized PNG at exercise-media/{id}.png.
// Images are uploaded to the Supabase Storage "exercise-media" bucket via the
// dashboard — no app release needed to add or swap art. ExerciseHero falls back
// to branded placeholder art when an image is missing.
export function exerciseImageUrl(exerciseId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/exercise-media/${exerciseId}.png`;
}

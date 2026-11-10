// User-approved clips and matching stills, verified in Supabase Storage.
// Versions refresh cached media when an exercise demo is replaced.
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const mediaBase = `${SUPABASE_URL}/storage/v1/object/public/exercise-media`;

export const EXERCISE_VIDEO_OVERRIDES: Record<string, string> = {
  lunge: `${mediaBase}/lunge.mp4?v=4a77f3c3163a`,
  plank: `${mediaBase}/plank.mp4?v=37aff42b8642`,
};

export const EXERCISE_IMAGE_OVERRIDES: Record<string, string> = {
  lunge: `${mediaBase}/lunge.png?v=ee08cebb444b`,
  plank: `${mediaBase}/plank.png?v=d3ba22c4437d`,
};

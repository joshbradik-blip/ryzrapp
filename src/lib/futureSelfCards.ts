// "Future You" pre-generated avatar cards — resolves a user's current/
// projected body-fat % and muscle level to the nearest cell in a
// pre-generated photo grid, by URL convention (mirrors exerciseMedia.ts).
//
// See docs/future-self-card-prompts.md for the full generation spec: the
// grid layout, avatar identities, and exact prompts used to produce the
// cards. Cards are optional per cell — callers should treat a failed image
// load (missing cell) as a signal to fall back to PhysiqueSilhouette, the
// same onError → fallback pattern ExerciseHero uses for exercise media.

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const BUCKET = 'future-self-cards';

export type Sex = 'male' | 'female';

/** Avatar ids available in the grid — extend as more avatars are generated. */
export const AVATAR_IDS = ['a1', 'a2', 'a3', 'a4', 'a5'] as const;
export type AvatarId = (typeof AVATAR_IDS)[number];

const BODY_FAT_LEVELS = 5;
const MUSCLE_LEVELS = 4;

// Same body-fat bounds as PhysiqueSilhouette's BOUNDS, so a card's bf bucket
// lines up with the silhouette's leanness scale for the same sex.
const BODY_FAT_BOUNDS: Record<Sex, { lean: number; soft: number }> = {
  male: { lean: 8, soft: 30 },
  female: { lean: 16, soft: 38 },
};

function clampIndex(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, Math.round(i)));
}

/** Nearest body-fat bucket (0..4) for this sex, evenly spaced across BODY_FAT_BOUNDS. */
export function bodyFatBucket(bodyFatPct: number, sex: Sex): number {
  const { lean, soft } = BODY_FAT_BOUNDS[sex];
  const t = (bodyFatPct - lean) / (soft - lean); // 0 = leanest, 1 = softest
  return clampIndex(t * (BODY_FAT_LEVELS - 1), BODY_FAT_LEVELS);
}

/** Nearest muscle bucket (0..3) for a 0..1 muscle level. */
export function muscleBucket(muscleLevel: number): number {
  return clampIndex(muscleLevel * (MUSCLE_LEVELS - 1), MUSCLE_LEVELS);
}

/**
 * Public Storage URL for the pre-generated card nearest this body-fat %
 * and muscle level. The image may not exist yet (grid is filled in
 * incrementally, avatar by avatar) — callers should fall back to
 * PhysiqueSilhouette on load failure.
 */
export function futureSelfCardUrl(
  sex: Sex,
  avatarId: AvatarId,
  bodyFatPct: number,
  muscleLevel: number
): string {
  const bf = bodyFatBucket(bodyFatPct, sex);
  const m = muscleBucket(muscleLevel);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${sex}/${avatarId}/bf${bf}_m${m}.png`;
}

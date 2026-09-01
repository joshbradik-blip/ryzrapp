// Which exercises the Form Coach is allowed to be offered on.
//
// The pipeline reads 2D keypoints from a single camera and scores movement by
// joint angles measured in the image plane. That is enough for reps, and for
// holds whose shape lives in that plane — a plank sagging at the hip reads
// clearly from the side. It is not enough for a mobility block:
//
//   * Rotation about the body's long axis is invisible to one 2D camera. An
//     open-book thoracic rotation done properly and one cheated from the
//     lumbar spine project to the same joint angles.
//   * Floor-based poses (90/90, side-lying) put limbs in front of each other,
//     so keypoint confidence collapses and `analyzeFraming` rejects most
//     frames anyway.
//   * "Are you feeling it in the right place" is not observable at all.
//
// Scoring those badly is worse than not scoring them: a stretch held correctly
// that gets corrected teaches the user to distrust the coach everywhere. So we
// do not offer it on mobility work until the pipeline can actually judge it.

/** Category values that mean "mobility work", across our library and ExerciseDB. */
const MOBILITY_CATEGORIES = new Set([
  'mobility',
  'stretching',
  'stretch',
  'flexibility',
]);

/**
 * Name patterns for mobility work that arrives with a muscle-group category.
 *
 * Exercises swapped in from ExerciseDB carry that source's `bodyPart` as their
 * category — a hamstring stretch comes through as "upper legs", not as
 * anything mobility-shaped — so the category check alone would miss them.
 */
const MOBILITY_NAME = /(stretch|mobility|foam.?roll|open.?book|dislocate|cat.?cow|thread the needle|90\s*\/\s*90|warm.?up|cool.?down)/i;

/**
 * True when the Form Coach can meaningfully score this exercise.
 *
 * Takes loose fields rather than an `Exercise` so the pose pipeline stays free
 * of app-level imports and remains testable under plain node.
 */
export function supportsFormCoach(exercise: {
  name?: string | null;
  category?: string | null;
}): boolean {
  const category = (exercise.category ?? '').toLowerCase().trim();
  if (MOBILITY_CATEGORIES.has(category)) return false;
  return !MOBILITY_NAME.test(exercise.name ?? '');
}

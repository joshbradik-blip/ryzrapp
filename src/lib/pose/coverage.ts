// Which exercises the Form Coach is allowed to be offered on.
//
// The pipeline reads 2D keypoints from a single camera and scores movement by
// joint angles measured in the image plane. That is enough for reps, and for
// holds whose shape lives in that plane — a plank sagging at the hip reads
// clearly from the side. Two families fall outside it:
//
//   * MOBILITY. Rotation about the body's long axis is invisible to one 2D
//     camera: an open-book thoracic rotation done properly and one cheated
//     from the lumbar spine project to the same joint angles. Floor-based
//     poses (90/90, side-lying) put limbs in front of each other, so keypoint
//     confidence collapses and `analyzeFraming` rejects most frames anyway.
//     And "are you feeling it in the right place" is not observable at all.
//
//   * CARDIO. Continuous, fast, whole-body work has no rep the detector can
//     anchor on, and the joints it would measure leave frame constantly. A
//     treadmill run has nothing for the coach to say.
//
// Neither family matches a profile in `profiles.ts`, so both used to fall
// through to GENERIC_PROFILE — which counts reps on elbow angle. Scoring them
// badly is worse than not scoring them: a stretch held correctly that gets
// corrected teaches the user to distrust the coach everywhere. So we do not
// offer it there at all until the pipeline can actually judge that work.

/** Category values that mean mobility or cardio, across our library and ExerciseDB. */
const UNSUPPORTED_CATEGORIES = new Set([
  // Mobility
  'mobility',
  'stretching',
  'stretch',
  'flexibility',
  // Cardio
  'cardio',
  'conditioning',
  'aerobic',
]);

/**
 * Name patterns for the same work arriving with a muscle-group category.
 *
 * Exercises swapped in from ExerciseDB carry that source's `bodyPart` as their
 * category — a hamstring stretch comes through as "upper legs", not as
 * anything mobility-shaped — so the category check alone would miss them.
 *
 * Kept deliberately specific. Bare "row" would hit barbell rows, and bare
 * "jump" would hit box jumps and jump squats, all of which the coach scores.
 */
const UNSUPPORTED_NAME = new RegExp(
  [
    // Mobility
    'stretch', 'mobility', 'foam.?roll', 'open.?book', 'dislocate',
    'cat.?cow', 'thread the needle', '90\\s*/\\s*90', 'warm.?up', 'cool.?down',
    // Cardio
    'treadmill', 'elliptical', 'stair ?master', 'stair ?climb',
    '\\b(run|runs|running|jog|jogging|sprint|sprints|sprinting)\\b',
    '\\bcycling\\b', '\\bbike\\b', '\\bskipping\\b',
    'jump(ing)? ?rope', 'jump(ing)? ?jack', 'rope skip',
    'burpee', 'mountain climber', 'high knees',
    'row(ing)? machine', '\\berg\\b',
  ].join('|'),
  'i'
);

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
  if (UNSUPPORTED_CATEGORIES.has(category)) return false;
  return !UNSUPPORTED_NAME.test(exercise.name ?? '');
}

import type { FramingCode } from '../../src/lib/pose/framing';
import { FormCoachSession, type SessionSummary } from '../../src/lib/pose/session';
import type { PoseFrame } from '../../src/lib/pose/types';

export const REVIEW_EXERCISES = {
  squat: 'Back Squat',
  goblet_squat: 'Goblet Squat',
  rdl: 'Romanian Deadlift',
  push_up: 'Push-Up',
} as const;

const MIN_TRACKING_QUALITY = 0.6;
const MIN_TRACKABLE_FRAME_RATIO = 0.7;

type ReviewAnalysis =
  | { status: 'ok'; summary: SessionSummary }
  | { status: 'retake'; cue: string };

export function analyzeFrames(
  exerciseId: keyof typeof REVIEW_EXERCISES,
  frames: PoseFrame[],
): ReviewAnalysis {
  const session = new FormCoachSession(REVIEW_EXERCISES[exerciseId]);
  const framingIssues = new Map<FramingCode, { count: number; cue: string }>();
  let trackableFrames = 0;
  let weakRep = false;

  for (const frame of frames) {
    const { framing, rep } = session.push(frame);
    if (framing.trackable) {
      trackableFrames++;
    } else {
      const issue = framingIssues.get(framing.code);
      if (issue) {
        issue.count++;
      } else {
        framingIssues.set(framing.code, {
          count: 1,
          cue: framing.code === 'too_dark' ? 'Add more light before recording again.' : framing.message,
        });
      }
    }
    if (rep && rep.quality < MIN_TRACKING_QUALITY) weakRep = true;
  }

  const summary = session.summary();
  if (
    summary.trackingQuality < MIN_TRACKING_QUALITY ||
    trackableFrames < frames.length * MIN_TRACKABLE_FRAME_RATIO ||
    weakRep
  ) {
    const issue = [...framingIssues.values()].sort((a, b) => b.count - a.count)[0];
    return {
      status: 'retake',
      cue: issue?.cue ?? 'Film from the side in good light and keep your moving joints in frame.',
    };
  }
  if (summary.reps === 0) {
    return { status: 'retake', cue: 'Film from the side and include a full rep from start to finish.' };
  }
  return { status: 'ok', summary };
}

import { supabase } from './supabase';

const EXERCISE_IDS = ['squat', 'goblet_squat', 'rdl', 'push_up'] as const;
export type VideoFormReviewExerciseId = (typeof EXERCISE_IDS)[number];
export const MAX_REVIEW_VIDEO_BYTES = 20 * 1024 * 1024;
export const MAX_REVIEW_VIDEO_SECONDS = 20;
export const MIN_REVIEW_VIDEO_SECONDS = 2;

type ReviewVideoType = 'video/mp4' | 'video/quicktime';
export type ReviewVideo = { uri: string; type: ReviewVideoType };
export type VideoFormReviewResult = { status: 'reviewed' | 'retake'; cue: string };

function reviewEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/review`;
    return url.href;
  } catch {
    return null;
  }
}

const REVIEW_ENDPOINT = reviewEndpoint(process.env.EXPO_PUBLIC_FORM_REVIEW_URL);
export const VIDEO_FORM_REVIEW_ENABLED = REVIEW_ENDPOINT !== null;

export function supportsVideoFormReview(exerciseId: string): exerciseId is VideoFormReviewExerciseId {
  return EXERCISE_IDS.some((id) => id === exerciseId);
}

export function isReviewVideoDuration(duration: number | null | undefined): boolean {
  return typeof duration === 'number'
    && duration >= MIN_REVIEW_VIDEO_SECONDS * 1000
    && duration <= MAX_REVIEW_VIDEO_SECONDS * 1000;
}

function localReviewVideo(uri: string, mimeType?: string | null, fileName?: string | null): ReviewVideo {
  if (!/^file:\/\/|^content:\/\//i.test(uri)) {
    throw new Error('Choose a local video to review.');
  }
  const file = (fileName || uri).split(/[?#]/, 1)[0].toLowerCase();
  const inferredType = file.endsWith('.mov') ? 'video/quicktime' : file.endsWith('.mp4') ? 'video/mp4' : undefined;
  const type = mimeType && mimeType !== 'application/octet-stream' ? mimeType : inferredType;
  if (type !== 'video/mp4' && type !== 'video/quicktime') {
    throw new Error('Choose an MP4 or MOV video.');
  }
  return { uri, type };
}

export function recordedReviewVideo(uri: string): ReviewVideo {
  return localReviewVideo(uri);
}

export function pickedReviewVideo(asset: {
  uri: string;
  duration?: number | null;
  fileSize?: number;
  mimeType?: string | null;
  fileName?: string | null;
}): ReviewVideo {
  if (!isReviewVideoDuration(asset.duration)) {
    throw new Error('Choose a video that is 2 to 20 seconds long.');
  }
  if (!asset.fileSize || asset.fileSize < 0 || asset.fileSize > MAX_REVIEW_VIDEO_BYTES) {
    throw new Error('Choose a video with a known file size of 20 MB or less.');
  }
  return localReviewVideo(asset.uri, asset.mimeType, asset.fileName);
}

export async function reviewVideoForm(
  exerciseId: VideoFormReviewExerciseId,
  video: ReviewVideo,
  signal: AbortSignal,
): Promise<VideoFormReviewResult> {
  if (!REVIEW_ENDPOINT) throw new Error('Video Form Review is unavailable.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in again to submit your video.');

  const body = new FormData();
  body.append('exerciseId', exerciseId);
  // React Native FormData accepts a URI descriptor for local files.
  body.append('video', {
    ...video,
    name: video.type === 'video/quicktime' ? 'form-review.mov' : 'form-review.mp4',
  } as unknown as Blob);

  const response = await fetch(REVIEW_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}` },
    body,
    signal,
  });
  const result: { status?: unknown; cue?: unknown; error?: unknown } | null =
    await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(typeof result?.error === 'string' && result.error.trim()
      ? result.error
      : 'Video review could not finish. Try again.');
  }
  if ((result?.status !== 'reviewed' && result?.status !== 'retake')
    || typeof result.cue !== 'string' || !result.cue.trim()) {
    throw new Error('Video review returned an invalid response. Try again.');
  }
  return { status: result.status, cue: result.cue };
}

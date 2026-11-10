import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { REVIEW_EXERCISES } from './analyze';

type ExerciseId = keyof typeof REVIEW_EXERCISES;
type ReviewResult = { status: 'reviewed' | 'retake'; cue: string };

export interface ReviewServices {
  authenticate(token: string): Promise<string | null>;
  hasPremium(userId: string): Promise<boolean>;
  review(exerciseId: ExerciseId, video: Buffer, token: string, userId: string): Promise<ReviewResult>;
}

const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_VIDEO_BYTES + 16 * 1024;
const DAILY_REVIEW_LIMIT = 6;
const MAX_ACTIVE_REQUESTS = 2;

class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function json(res: ServerResponse, status: number, data: ReviewResult | { error: string } | { ok: true }) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    ...(status >= 400 ? { Connection: 'close' } : {}),
  });
  res.end(JSON.stringify(data));
}

async function readClip(req: IncomingMessage, contentType: string) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    bytes += chunk.length;
    if (bytes > MAX_BODY_BYTES) throw new RequestError(413, 'Choose a clip under 20 MB.');
    chunks.push(chunk);
  }

  let form: FormData;
  try {
    form = await new Response(Buffer.concat(chunks, bytes), {
      headers: { 'Content-Type': contentType },
    }).formData();
  } catch {
    throw new RequestError(400, 'Could not read the upload. Choose the clip again.');
  }

  const exerciseId = form.get('exerciseId');
  if (typeof exerciseId !== 'string' || !Object.hasOwn(REVIEW_EXERCISES, exerciseId)) {
    throw new RequestError(400, 'Video review is unavailable for this exercise.');
  }
  const clip = form.get('video');
  if (!clip || typeof clip === 'string' || clip.size === 0 ||
    (clip.type !== 'video/mp4' && clip.type !== 'video/quicktime')) {
    throw new RequestError(400, 'Choose a short MP4 or MOV clip.');
  }
  if (clip.size > MAX_VIDEO_BYTES) throw new RequestError(413, 'Choose a clip under 20 MB.');
  return { exerciseId: exerciseId as ExerciseId, video: Buffer.from(await clip.arrayBuffer()) };
}

export function createReviewServer(services: ReviewServices) {
  const usage = new Map<string, number>();
  const activeUsers = new Set<string>();
  let usageDay = '';
  let activeRequests = 0;

  return createServer({ requestTimeout: 45_000, headersTimeout: 15_000, connectionsCheckingInterval: 5_000 }, async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      json(res, 200, { ok: true });
      return;
    }
    if (req.method !== 'POST' || req.url !== '/review') {
      json(res, 404, { error: 'Not found.' });
      return;
    }

    const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token) {
      json(res, 401, { error: 'Sign in to review a clip.' });
      return;
    }
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data;')) {
      json(res, 400, { error: 'Choose a clip to upload.' });
      return;
    }
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) {
      json(res, 413, { error: 'Choose a clip under 20 MB.' });
      return;
    }
    if (activeRequests >= MAX_ACTIVE_REQUESTS) {
      json(res, 503, { error: 'Video review is busy. Try again shortly.' });
      return;
    }

    activeRequests += 1;
    let activeUserId: string | undefined;
    try {
      const userId = await services.authenticate(token);
      if (!userId) throw new RequestError(401, 'Sign in again to review a clip.');
      if (activeUsers.has(userId)) throw new RequestError(409, 'A review is already in progress.');
      activeUsers.add(userId);
      activeUserId = userId;

      if (!await services.hasPremium(userId)) throw new RequestError(403, 'Video form review requires Premium.');
      const today = new Date().toISOString().slice(0, 10);
      if (today !== usageDay) {
        usage.clear();
        usageDay = today;
      }
      if ((usage.get(userId) ?? 0) >= DAILY_REVIEW_LIMIT) {
        throw new RequestError(429, 'You have reached today’s video review limit.');
      }
      const { exerciseId, video } = await readClip(req, contentType);
      if (res.destroyed) return;
      if (usageDay === today) usage.set(userId, (usage.get(userId) ?? 0) + 1);

      const result = await services.review(exerciseId, video, token, userId);
      if (!res.destroyed) json(res, 200, result);
    } catch (error) {
      if (res.destroyed) return;
      if (error instanceof RequestError) {
        json(res, error.status, { error: error.message });
      } else {
        // The request, provider response, and decoder stderr can contain private data.
        console.error('Form review request failed.');
        json(res, 503, { error: 'Could not review this clip right now. Try again shortly.' });
      }
    } finally {
      if (activeUserId) activeUsers.delete(activeUserId);
      activeRequests -= 1;
    }
  });
}

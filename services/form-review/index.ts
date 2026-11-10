import { execFile } from 'node:child_process';
import { access, mkdtemp, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { PoseFrame } from '../../src/lib/pose/types';
import type { SessionSummary } from '../../src/lib/pose/session';
import { costOf, type AnthropicUsage } from '../../src/lib/usageCost';
import { analyzeFrames } from './analyze';
import { createReviewServer } from './server';

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const supabaseUrl = new URL(required('SUPABASE_URL'));
if (supabaseUrl.protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS');
const supabaseKey = required('SUPABASE_ANON_KEY');
const anthropicKey = required('ANTHROPIC_KEY');
const modelPath = resolve(required('FORM_REVIEW_MODEL_PATH'));
const revenueCatKey = process.env.REVENUECAT_SECRET_API_KEY?.trim();
const betaUsers = new Set((process.env.FORM_REVIEW_BETA_USER_IDS ?? '').split(',').map((id) => id.trim()).filter(Boolean));
if (!revenueCatKey && betaUsers.size === 0) throw new Error('Configure RevenueCat or a review beta allowlist');

const claudeModel = 'claude-haiku-4-5-20251001';
const runDecoder = promisify(execFile);
const decoder = fileURLToPath(new URL('./pose_frames.py', import.meta.url));
const python = process.env.FORM_REVIEW_PYTHON || 'python';
const decoderEnv = {
  PATH: process.env.PATH,
  SystemRoot: process.env.SystemRoot,
  FORM_REVIEW_MODEL_PATH: modelPath,
};

function supabaseHeaders(token: string) {
  return { apikey: supabaseKey, Authorization: `Bearer ${token}` };
}

async function authenticate(token: string): Promise<string | null> {
  const response = await fetch(new URL('/auth/v1/user', supabaseUrl), {
    headers: supabaseHeaders(token),
    signal: AbortSignal.timeout(8_000),
    redirect: 'error',
  });
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new Error('Authentication service unavailable');
  const user: { id?: string; is_anonymous?: boolean } = await response.json();
  return user.is_anonymous || typeof user.id !== 'string' ? null : user.id;
}

async function hasPremium(userId: string) {
  if (betaUsers.has(userId)) return true;
  if (!revenueCatKey) return false;
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${revenueCatKey}` },
    signal: AbortSignal.timeout(8_000),
    redirect: 'error',
  });
  if (response.status === 404) return false;
  if (!response.ok) throw new Error('Premium status unavailable');
  const data: { subscriber?: { entitlements?: {
    premium?: { expires_date?: string | null; grace_period_expires_date?: string | null };
  } } } = await response.json();
  const premium = data.subscriber?.entitlements?.premium;
  if (!premium) return false;
  const now = Date.now();
  return premium.expires_date === null || Date.parse(premium.expires_date ?? '') > now ||
    Date.parse(premium.grace_period_expires_date ?? '') > now;
}

async function extractFrames(video: Buffer) {
  const dir = await mkdtemp(join(tmpdir(), 'ryzr-form-'));
  const clipPath = join(dir, 'set.mp4');
  try {
    await writeFile(clipPath, video, { mode: 0o600 });
    const { stdout } = await runDecoder(python, [decoder, clipPath], {
      env: decoderEnv,
      timeout: 35_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const result = JSON.parse(stdout) as { status: 'ok'; frames: PoseFrame[] } | { status: 'retake'; cue: string };
    return result;
  } finally {
    await rm(clipPath, { force: true });
    await rmdir(dir);
  }
}

async function coachingCue(summary: SessionSummary, token: string, userId: string) {
  const measurements = {
    exercise: summary.exerciseName,
    repetitions: summary.reps,
    meanRepSeconds: summary.averageRepMs / 1000,
    meanLoweringSeconds: summary.averageEccentricMs / 1000,
    relativeDepth: summary.averagePeakDepth,
    observedIssues: summary.topIssues.slice(0, 3),
  };
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 96,
      system: 'Write one short, actionable coaching cue for the next set, based only on the supplied exercise measurements. If no issue was observed, reinforce one consistent movement habit. Do not diagnose injuries, assign a score, prescribe weight, or claim you watched the video. Return one sentence of plain text.',
      messages: [{ role: 'user', content: JSON.stringify(measurements) }],
    }),
    signal: AbortSignal.timeout(12_000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Coaching service unavailable');
  const data: { content?: { type: string; text?: string }[]; model?: string; usage?: AnthropicUsage } = await response.json();
  if (data.usage) {
    const model = data.model ?? claudeModel;
    const usage = data.usage;
    void fetch(new URL('/rest/v1/api_usage', supabaseUrl), {
      method: 'POST',
      headers: { ...supabaseHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        feature: 'video_form_review',
        model,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_tokens: usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
        cost_usd: costOf(model, usage),
      }),
      signal: AbortSignal.timeout(5_000),
      redirect: 'error',
    }).then((result) => result.body?.cancel()).catch(() => {});
  }
  const cue = data.content?.find((block) => block.type === 'text')?.text?.replace(/\s+/g, ' ').trim();
  if (!cue || cue.length > 420) throw new Error('Missing short coaching cue');
  return cue;
}

await access(modelPath);
const server = createReviewServer({
  authenticate,
  hasPremium,
  async review(exerciseId, video, token, userId) {
    const extracted = await extractFrames(video);
    if (extracted.status === 'retake') return extracted;
    const result = analyzeFrames(exerciseId, extracted.frames);
    if (result.status === 'retake') return result;
    return { status: 'reviewed', cue: await coachingCue(result.summary, token, userId) };
  },
});
const port = Number(process.env.PORT ?? 8080);
server.listen(port, '0.0.0.0', () => console.log(`Form review listening on port ${port}.`));

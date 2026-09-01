// Bulk-download Higgsfield demo media and upload to the Supabase `exercise-media` bucket.
//
// Setup: add ONE line to .env (get it from Supabase dashboard → Settings → API → "service_role" secret):
//   SUPABASE_SERVICE_ROLE_KEY=eyJ...
// Then run:
//   node scripts/upload-exercise-media.mjs
//
// Reads scripts/exercise-media.json:
//   { "<exercise_id>": { "image": "<https url>", "video": "<https url>" }, ... }
// Uploads each to exercise-media/{id}.png and exercise-media/{id}.mp4 (upsert).
//
// When an entry has a video but no image, the still is extracted from the clip
// with ffmpeg (a frame from the middle of the movement, not the first frame,
// which is the neutral starting pose). That costs nothing and guarantees the
// still and the clip show the same athlete in the same lighting. Needs ffmpeg
// on PATH; without it those entries upload the clip only and say so.
// The app's ExerciseHero already resolves clip -> still -> fallback by this convention,
// so no app release is needed — files just start showing once uploaded.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Load .env (simple parser — no dependency).
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env (Supabase dashboard → Settings → API → service_role).');
  process.exit(1);
}

const manifest = JSON.parse(
  fs.readFileSync(new URL('./exercise-media.json', import.meta.url), 'utf8')
);

async function uploadBuffer(id, kind, buf) {
  const ext = kind === 'image' ? 'png' : 'mp4';
  const contentType = kind === 'image' ? 'image/png' : 'video/mp4';
  try {
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/exercise-media/${id}.${ext}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': contentType, 'x-upsert': 'true' },
      body: buf,
    });
    console.log(`  ${up.ok ? 'OK ' : 'ERR'} ${id}.${ext}${up.ok ? '' : ' — ' + (await up.text())}`);
  } catch (e) {
    console.error(`  ERROR ${id}.${ext}: ${e.message}`);
  }
}

async function uploadOne(id, kind, url) {
  if (!url) return;
  const ext = kind === 'image' ? 'png' : 'mp4';
  try {
    const res = await fetch(url);
    if (!res.ok) { console.error(`  download FAIL ${id}.${ext}: ${res.status}`); return; }
    await uploadBuffer(id, kind, Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    console.error(`  ERROR ${id}.${ext}: ${e.message}`);
  }
}

/** Grab a frame from mid-clip as the still. Returns a PNG buffer, or null. */
async function posterFromVideo(id, url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ryzr-media-'));
  const mp4 = path.join(dir, `${id}.mp4`);
  const png = path.join(dir, `${id}.png`);
  try {
    const res = await fetch(url);
    if (!res.ok) { console.error(`  poster FAIL ${id}: download ${res.status}`); return null; }
    fs.writeFileSync(mp4, Buffer.from(await res.arrayBuffer()));
    // Halfway through a 5s clip the movement is at its most recognizable.
    execFileSync('ffmpeg', ['-y', '-ss', '2.5', '-i', mp4, '-frames:v', '1', png], { stdio: 'ignore' });
    return fs.readFileSync(png);
  } catch (e) {
    console.error(`  poster SKIP ${id}: ${e.code === 'ENOENT' ? 'ffmpeg not on PATH' : e.message}`);
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

for (const [id, m] of Object.entries(manifest)) {
  console.log(id);
  if (m.image) {
    await uploadOne(id, 'image', m.image);
  } else if (m.video) {
    const poster = await posterFromVideo(id, m.video);
    if (poster) await uploadBuffer(id, 'image', poster);
  }
  await uploadOne(id, 'video', m.video);
}
console.log('Done.');

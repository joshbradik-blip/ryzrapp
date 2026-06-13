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
// The app's ExerciseHero already resolves clip -> still -> fallback by this convention,
// so no app release is needed — files just start showing once uploaded.

import fs from 'node:fs';

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

async function uploadOne(id, kind, url) {
  if (!url) return;
  const ext = kind === 'image' ? 'png' : 'mp4';
  const contentType = kind === 'image' ? 'image/png' : 'video/mp4';
  try {
    const res = await fetch(url);
    if (!res.ok) { console.error(`  download FAIL ${id}.${ext}: ${res.status}`); return; }
    const buf = Buffer.from(await res.arrayBuffer());
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

for (const [id, m] of Object.entries(manifest)) {
  console.log(id);
  await uploadOne(id, 'image', m.image);
  await uploadOne(id, 'video', m.video);
}
console.log('Done.');

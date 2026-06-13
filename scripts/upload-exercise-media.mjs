// Bulk-download Higgsfield demo media and upload to the Supabase `exercise-media` bucket.
//
// Usage (PowerShell):
//   $env:SUPABASE_URL="https://fuyzcssdryngvxmmjkvn.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<service role key from Supabase dashboard → Settings → API>"
//   node scripts/upload-exercise-media.mjs
//
// Reads scripts/exercise-media.json:
//   { "<exercise_id>": { "image": "<https url>", "video": "<https url>" }, ... }
// Uploads each to exercise-media/{id}.png and exercise-media/{id}.mp4 (upsert).
// The app's ExerciseHero already resolves clip -> still -> fallback by this convention,
// so no app release is needed — files just start showing once uploaded.

import fs from 'node:fs';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars first.');
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
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
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

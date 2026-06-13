// Generate simple line-figure demo images for ExerciseDB "swap pool" exercises via
// Google Imagen, replacing the text-only fallback. Generates + uploads straight to the
// Supabase exercise-media bucket as edb_<id>.png (the app already resolves that name
// for swapped exercises — no app change). Prints a public URL per image for review.
//
// Uses keys already in .env: GEMINI_API_KEY, EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_EXERCISEDB_KEY
// Test a few first:   node scripts/generate-stick-figures.mjs --limit 5
// Full batch (~1,300, ~$30-50 on imagen-4.0-fast):   node scripts/generate-stick-figures.mjs --all

import fs from 'node:fs';

try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const EDB_KEY = process.env.EXPO_PUBLIC_EXERCISEDB_KEY;
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
for (const [k, v] of [['GEMINI_API_KEY', GEMINI_KEY], ['EXPO_PUBLIC_EXERCISEDB_KEY', EDB_KEY], ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL], ['SUPABASE_SERVICE_ROLE_KEY', SUPABASE_KEY]]) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

const args = process.argv.slice(2);
const all = args.includes('--all');
const li = args.indexOf('--limit');
const limit = all ? Infinity : (li >= 0 ? parseInt(args[li + 1], 10) : 5);

const STYLE = 'Minimal clean line-art figure demonstrating a fitness exercise, thin ember-orange (#FF6B22) lines on a solid near-black charcoal background, instructional diagram style, single centered figure, no text, no watermark';
const MODEL = 'imagen-4.0-fast-generate-001';
const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict`;

async function fetchExercises() {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`https://exercisedb.p.rapidapi.com/exercises?limit=100&offset=${offset}`, {
      headers: { 'x-rapidapi-host': 'exercisedb.p.rapidapi.com', 'x-rapidapi-key': EDB_KEY },
    });
    if (!res.ok) throw new Error(`ExerciseDB ${res.status}: ${await res.text()}`);
    const page = await res.json();
    if (!page.length) break;
    out.push(...page);
    if (out.length >= limit) break;
    if (page.length < 100) break;
  }
  return out.slice(0, limit === Infinity ? out.length : limit);
}

async function genAndUpload(ex) {
  const id = `edb_${ex.id}`;
  const prompt = `${STYLE}, demonstrating the "${ex.name}" exercise: ${(ex.instructions?.[0] ?? ex.name)}`;
  const gen = await fetch(IMAGEN_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
  });
  if (!gen.ok) { console.error(`  ERR ${id}: imagen ${gen.status} ${(await gen.text()).slice(0, 200)}`); return; }
  const b64 = (await gen.json()).predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.error(`  ERR ${id}: no image returned`); return; }
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/exercise-media/${id}.png`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: Buffer.from(b64, 'base64'),
  });
  if (!up.ok) { console.error(`  ERR ${id}: upload ${up.status} ${(await up.text()).slice(0, 200)}`); return; }
  console.log(`  OK  ${SUPABASE_URL}/storage/v1/object/public/exercise-media/${id}.png`);
}

const exercises = await fetchExercises();
console.log(`Generating + uploading ${exercises.length} line figures (model ${MODEL})`);
for (const ex of exercises) {
  console.log(`${ex.id} ${ex.name}`);
  await genAndUpload(ex);
}
console.log('Done.');

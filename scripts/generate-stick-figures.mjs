// Generate simple line-figure demo images for ExerciseDB "swap pool" exercises via
// Google Imagen, replacing the text-only fallback. Generates + uploads straight to the
// Supabase exercise-media bucket as edb_<id>.png (the app already resolves that name
// for swapped exercises — no app change). Prints a public URL per image for review.
//
// Uses keys already in .env: GEMINI_API_KEY, EXPO_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, EXPO_PUBLIC_EXERCISEDB_KEY
// Test a few first:   node scripts/generate-stick-figures.mjs --limit 5
// Full batch (~1,300):  node scripts/generate-stick-figures.mjs --all
// Uses imagen-4.0-fast (free tier). The free tier rate-limits bursts (429); the script
// backs off and retries, and skips already-uploaded images, so a run grinds through a
// chunk and you just re-run --all to continue.
// The exercise catalog is cached to exercisedb-list.json on the first --all; pass --refresh to rebuild it.

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
const refresh = args.includes('--refresh');
const li = args.indexOf('--limit');
const limit = all ? Infinity : (li >= 0 ? parseInt(args[li + 1], 10) : 5);
const CACHE = new URL('./exercisedb-list.json', import.meta.url);

const STYLE = 'Minimal clean line-art diagram of ONE single person demonstrating a fitness exercise, exactly one anatomically correct figure with two arms and two legs, bold bright ember-orange (#FF6B22) lines on a solid near-black charcoal background, side profile, the figure is large and centered and fills most of the frame, clean instructional style, no extra limbs, no duplicate figures, no text or labels of any kind.';
const MODEL = 'imagen-4.0-fast-generate-001';
const IMAGEN_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:predict`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchExercises() {
  // Reuse the cached catalog so resume runs don't re-page the API (~130 calls). --refresh forces a re-fetch.
  if (!refresh) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
      if (Array.isArray(cached) && cached.length) return cached.slice(0, limit === Infinity ? cached.length : limit);
    } catch {}
  }
  const out = [];
  const PAGE = 10; // free RapidAPI plan caps results at 10 per request, so page by 10
  for (let offset = 0; ; offset += PAGE) {
    const res = await fetch(`https://exercisedb.p.rapidapi.com/exercises?limit=${PAGE}&offset=${offset}`, {
      headers: { 'x-rapidapi-host': 'exercisedb.p.rapidapi.com', 'x-rapidapi-key': EDB_KEY },
    });
    if (!res.ok) throw new Error(`ExerciseDB ${res.status}: ${await res.text()}`);
    const page = await res.json();
    if (!page.length) break;
    out.push(...page);
    if (out.length >= limit) break;
  }
  if (limit === Infinity) fs.writeFileSync(CACHE, JSON.stringify(out)); // cache only a full enumeration
  return out.slice(0, limit === Infinity ? out.length : limit);
}

async function genAndUpload(ex) {
  const id = `edb_${ex.id}`;
  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/exercise-media/${id}.png`;
  // Resume support: skip anything already uploaded so re-runs continue where they left off.
  const head = await fetch(publicUrl, { method: 'HEAD' });
  if (head.ok) { console.log(`  SKIP ${id} (already exists)`); return 'skipped'; }
  const how = (ex.instructions?.[0] ?? ex.name);
  const prompt = `${STYLE} The figure is performing the ${ex.name} in its key working position. Context: ${how}`;
  let gen;
  for (let attempt = 1; ; attempt++) {
    gen = await fetch(IMAGEN_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
    });
    if (gen.status !== 429) break;
    if (attempt > 8) { console.error(`  ERR ${id}: still 429 after ${attempt - 1} retries`); return 'error'; }
    const wait = Math.min(20000 * attempt, 60000); // rate-limit backoff: 20s, 40s, 60s, 60s...
    console.log(`  RATE ${id}: 429, backing off ${wait / 1000}s (retry ${attempt})`);
    await sleep(wait);
  }
  if (!gen.ok) { console.error(`  ERR ${id}: imagen ${gen.status} ${(await gen.text()).slice(0, 200)}`); return 'error'; }
  const b64 = (await gen.json()).predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.error(`  ERR ${id}: no image returned`); return 'error'; }
  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/exercise-media/${id}.png`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SUPABASE_KEY}`, apikey: SUPABASE_KEY, 'Content-Type': 'image/png', 'x-upsert': 'true' },
    body: Buffer.from(b64, 'base64'),
  });
  if (!up.ok) { console.error(`  ERR ${id}: upload ${up.status} ${(await up.text()).slice(0, 200)}`); return 'error'; }
  console.log(`  OK  ${publicUrl}`);
  return 'ok';
}

const exercises = await fetchExercises();
console.log(`Generating + uploading ${exercises.length} line figures (model ${MODEL})`);
let ok = 0, skipped = 0, errored = 0;
for (const ex of exercises) {
  console.log(`${ex.id} ${ex.name}`);
  const r = await genAndUpload(ex);
  if (r === 'ok') { ok++; await sleep(1500); } // pace generations to ease the rate limit
  else if (r === 'skipped') skipped++;
  else errored++;
}
console.log(`Done. ${ok} generated, ${skipped} skipped, ${errored} errored.`);

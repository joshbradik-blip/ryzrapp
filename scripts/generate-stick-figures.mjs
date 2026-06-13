// Generate simple stick-figure demo images for ExerciseDB exercises via Google Imagen,
// for the long-tail "swap pool" exercises that have no avatar media (replaces the
// text-only fallback). Saves PNGs locally for review; upload separately once happy.
//
// Setup (.env):
//   GEMINI_API_KEY=AIza...                 (aistudio.google.com → Get API key — must start with AIza)
//   EXPO_PUBLIC_EXERCISEDB_KEY=...          (already present)
// Run a small test first:
//   node scripts/generate-stick-figures.mjs --limit 5
// Then the full batch (~1,300 — costs roughly $30–50 on Imagen):
//   node scripts/generate-stick-figures.mjs --all
//
// Output: scripts/stick-figures/edb_<id>.png  (app resolves this name for swapped exercises)

import fs from 'node:fs';
import path from 'node:path';

// --- load .env ---
try {
  const env = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}

const GEMINI_KEY = process.env.GEMINI_API_KEY;
const EDB_KEY = process.env.EXPO_PUBLIC_EXERCISEDB_KEY;
if (!GEMINI_KEY || !GEMINI_KEY.startsWith('AIza')) {
  console.error('GEMINI_API_KEY missing or wrong format (must start with "AIza" — get it from aistudio.google.com → Get API key).');
  process.exit(1);
}
if (!EDB_KEY) { console.error('EXPO_PUBLIC_EXERCISEDB_KEY missing in .env.'); process.exit(1); }

const args = process.argv.slice(2);
const all = args.includes('--all');
const limitArg = args.indexOf('--limit');
const limit = all ? Infinity : (limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : 5);

const OUT = new URL('./stick-figures/', import.meta.url);
fs.mkdirSync(OUT, { recursive: true });

const STYLE = 'Minimal black line-art stick figure on a plain white background, clean instructional diagram style, single figure, no text, no color, no shading';
const IMAGEN_URL = 'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict';

async function fetchExercises() {
  // ExerciseDB paginates; pull in pages of 100.
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`https://exercisedb.p.rapidapi.com/exercises?limit=100&offset=${offset}`, {
      headers: { 'x-rapidapi-host': 'exercisedb.p.rapidapi.com', 'x-rapidapi-key': EDB_KEY },
    });
    if (!res.ok) throw new Error(`ExerciseDB ${res.status}`);
    const page = await res.json();
    if (!page.length) break;
    out.push(...page);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit === Infinity ? out.length : limit);
}

async function genOne(ex) {
  const id = `edb_${ex.id}`;
  const file = path.join(OUT.pathname.replace(/^\//, ''), `${id}.png`);
  const prompt = `${STYLE}, demonstrating the "${ex.name}" exercise: ${(ex.instructions?.[0] ?? ex.name)}`;
  const res = await fetch(IMAGEN_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': GEMINI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
  });
  if (!res.ok) { console.error(`  ERR ${id}: ${res.status} ${await res.text()}`); return; }
  const json = await res.json();
  const b64 = json.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) { console.error(`  ERR ${id}: no image in response`); return; }
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log(`  OK  ${id}.png`);
}

const exercises = await fetchExercises();
console.log(`Generating ${exercises.length} stick figures → scripts/stick-figures/`);
for (const ex of exercises) {
  console.log(`${ex.id} ${ex.name}`);
  await genOne(ex);
}
console.log('Done. Review the PNGs, then upload edb_*.png to the exercise-media bucket.');

# RYZR Exercise Media — Higgsfield Recipe

The working generation parameters for exercise demo clips. Validated on the Back Squat test (2026-06-13), re-validated on the mobility/cardio batch (2026-09-01) — keep this recipe.

**Read this first: the two steps do not do what their names suggest.** Step 1 does *not* produce the demo image. `soul_cast` casts a *person* — it returns a casting sheet (a neutral standing figure on a plain grey background, often as front/back/face panels) and attaches an invented character bio. The exercise wording in its prompt is largely ignored; it steers the physique, not the pose. **The demo itself — the movement, the pure-black background, the ember rim light — comes entirely from Step 2.** Judge the batch on the clips, never on the Step 1 output. Mistaking the casting sheet for a failed still has cost a batch's worth of credits before.

## Tooling
- Higgsfield MCP (connected). Workspace: private, PLUS plan.
- Cost: still ≈ **0.12 credits**, 5s/16:9/720p clip ≈ **22.5 credits**.

## Step 1 — Cast the athlete (Soul Cast)
Produces the *character* that Step 2 animates. Its output is a working reference, **not** a shippable image — never upload it as `{id}.png`.

- **model:** `soul_cast`
- **aspect_ratio:** `16:9` (matches the landscape hero; cover-cropped to ~3:2 in-app)
- **budget:** 50 (model default — a compute setting, NOT 50 credits)
- **style:** General_v2 (cinematic) — applied automatically
- **prompt structure:** describe the athlete first, since that is what this step actually controls; the exercise clause mostly just biases the build.
  > Stylized dark cinematic 3D render of {AVATAR} performing {EXERCISE + key position from the exercise's execution cue}. Matte charcoal-black body with ember-orange rim lighting from the right, pure black background, dramatic studio lighting, photoreal materials, full body centered in frame. No text, no watermark.

Expect back: a grey-background standing figure and a character name/bio in the job params. That is success, not failure — carry the job_id to Step 2.

## Step 2 — The demo clip (Seedance 2.0, image-to-video)
This is the step that produces everything the user sees: the movement, the black background, the ember lighting. Its prompt must carry the full look, not just the motion — it is restyling the casting sheet, not merely animating it.

- **model:** `seedance_2_0`
- **medias:** `[{ role: "start_image", value: "<Step 1 job_id>" }]` — pass the casting job's **job_id** directly (no re-upload)
- **duration:** `5` (default is 15 = ~67 credits; ALWAYS set 5 to stay ~22 credits)
- **aspect_ratio:** `16:9`
- **resolution:** `720p`
- **generate_audio:** `false` for the batch — the app plays demos muted, so don't pay to generate sound
- **prompt structure:**
  > The athlete performs one controlled {EXERCISE}: {down-phase} then {up-phase}. Steady tempo, {form cue}. Fixed camera, dark studio lighting with ember rim light, pure black background.

## Avatars (4 rotating characters)
Lock each as a reusable character (pin a chosen reference still, or train a Soul) so the SAME person appears across all of that avatar's exercises:
1. **Big muscular guy** — heavily muscled male bodybuilder build
2. **Surfer-fit guy** — lean athletic male, surfer physique
3. **Fitness-model female** — toned athletic female
4. **Yoga-type female** — lean flexible female, yoga/pilates build

Each of the 30 curated exercises is assigned to one avatar (rotate sensibly, e.g. by movement style). The avatar choice is baked into the generated file — no app logic needed.

## Output & upload
- Clip → `{id}.mp4`, uploaded to the public Supabase `exercise-media` bucket.
- **The still is derived, not generated.** `scripts/upload-exercise-media.mjs` extracts `{id}.png` from a frame 2.5s into the clip when a manifest entry has a `video` but no `image` — free, and the still then matches its clip in athlete and lighting. Needs `ffmpeg` on PATH; without it the entry uploads the clip only and logs why. Do not take the frame at 0s: that is still the neutral casting pose.
- Add entries to `scripts/exercise-media.json` as `{ "<id>": { "video": "<url>" } }`, then run the script with `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
- App resolves **clip → still → branded fallback** (`ExerciseHero`). All optional; no app release to add media.

## Before you batch
A clip is ~22.5 credits and there is no cancel API — a submitted batch bills whether or not you use it. So: run **one** exercise end to end, look at the clip, and only then submit the rest.

## Scope (see also docs/exercise-image-prompts.md for the per-exercise pose wording)
- **Generate avatar media for the 30 curated exercises only** — that's what the AI planner assigns from.
- The 1,300+ ExerciseDB exercises (manual-swap pool) keep their built-in API **GIFs** — no avatar generation (cost/latency prohibitive at that scale).

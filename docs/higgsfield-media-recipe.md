# RYZR Exercise Media — Higgsfield Recipe

The working generation parameters for exercise demo stills + clips. Validated on the Back Squat test (2026-06-13) — keep this recipe.

## Tooling
- Higgsfield MCP (connected). Workspace: private, PLUS plan.
- Cost: still ≈ **0.12 credits**, 5s/16:9/720p clip ≈ **22.5 credits**.

## Step 1 — Still (Soul Cast)
- **model:** `soul_cast`
- **aspect_ratio:** `16:9` (matches the landscape hero; cover-cropped to ~3:2 in-app)
- **budget:** 50 (model default — a compute setting, NOT 50 credits)
- **style:** General_v2 (cinematic) — applied automatically
- **prompt structure:**
  > Stylized dark cinematic 3D render of {AVATAR} performing {EXERCISE + key position from the exercise's execution cue}. Matte charcoal-black body with ember-orange rim lighting from the right, pure black background, dramatic studio lighting, photoreal materials, full body centered in frame. No text, no watermark.

## Step 2 — Clip (Seedance 2.0, image-to-video)
- **model:** `seedance_2_0`
- **medias:** `[{ role: "start_image", value: "<still job_id>" }]` — pass the still's **job_id** directly (no re-upload)
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
- Still → `{id}.png`, clip → `{id}.mp4`, uploaded to the public Supabase `exercise-media` bucket.
- App resolves **clip → still → branded fallback** (`ExerciseHero`). All optional; no app release to add media.

## Scope (see also docs/exercise-image-prompts.md for the 29 prompts)
- **Generate avatar media for the 30 curated exercises only** — that's what the AI planner assigns from.
- The 1,300+ ExerciseDB exercises (manual-swap pool) keep their built-in API **GIFs** — no avatar generation (cost/latency prohibitive at that scale).

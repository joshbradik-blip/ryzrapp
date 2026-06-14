# RYZR — Project Status

_Last updated: 2026-06-14_

> **Resuming in a new session?** Open a terminal in this folder, run `claude`, and say
> **"catch me up on RYZR."** Claude auto-loads its project memory, reads this file, and
> checks `git log`. This file is the human-readable source of truth; the deeper detail
> lives in `docs/` and Claude's memory.

## Released
- **v1.0.7 (iOS build 14) — LIVE on the App Store** since 2026-06-12.

## In progress: v1.0.8 "Ember" — CODE COMPLETE on local `main` (NOT pushed to GitHub yet)
Verified working on-device (Samsung S23). What shipped in this version:
- Ember-orange redesign (Today, Workout Session, Exercise Detail, Progress, Store) + shared UI primitives
- **Forgot-password email recovery** with `ryzr://reset-password` deep link + reset screen
- **Realistic AI avatar exercise demos** for all 30 curated exercises (stills + motion clips), replacing the YouTube embed; branded fallback for swapped/long-tail exercises
- Real stats (streaks, volume, muscle-group heatmap) from workout history
- Free **Body Composition** tracker (US Navy body-fat) replacing the paid Prism body scan
- Social tab removed; duplicate motivation push removed; misc App-review fixes
- Versions: **1.0.8 / iOS build 17 / Android versionCode 19**

## Builds
- **Android:** built ✅ — EAS app-bundle, versionCode 19 → https://expo.dev/accounts/jujitsujosh/projects/ryzrapp/builds/e189e321-5236-4f26-9514-09bf49d7b530
- **iOS:** not built yet. `eas build --platform ios --profile production --non-interactive`
- ⚠️ EAS build credits ~93% used this month (further builds may be pay-as-you-go).

## To finish shipping 1.0.8
1. **iOS build + submit:** `eas build --platform ios ...` then `eas submit --platform ios --latest --non-interactive`
2. **Attach all 3 IAPs on the ASC version page** before Submit for Review (this caused past 2.1(b) rejections)
3. Reviewer demo account: `test@ryzr.com` / `apptest`
4. **`git push`** `main` to back up (currently local-only)
5. (Android, if releasing) Play Console app + Google service-account JSON for `eas submit --platform android`

## Backlog / later
- **Exercise media for the long tail (~1,300 ExerciseDB swaps):** currently branded fallback. Tooling ready in `scripts/generate-stick-figures.mjs` (Imagen) — paused; plan is to do realistic avatars properly (paid) like the 30. Recipe: `docs/higgsfield-media-recipe.md`.
- **v1.0.9:** Apple + Google sign-in (Supabase providers; reuses the `ryzr://` deep link). Apple required if Google is added (Guideline 4.8).
- **Security:** rotate the Supabase `service_role` (`sb_secret_…`) key — it was pasted into a chat.

## Key infrastructure
- **Supabase** project `fuyzcssdryngvxmmjkvn` (auth, DB, `exercise-media` storage bucket). Uses new key format (`sb_publishable_` / `sb_secret_`).
- **EAS** account `jujitsujosh`; ASC App ID `6767086947`; bundle `com.ryzr.app`.
- **RevenueCat** for subscriptions (Monthly / Annual / Founder Lifetime).
- **Higgsfield MCP** (avatar media) + **Google Gemini/Imagen** key in `.env` (local scripts only; never bundled).
- Local media scripts: `scripts/upload-exercise-media.mjs`, `scripts/generate-stick-figures.mjs`, manifest `scripts/exercise-media.json`.

## Where the detail lives
- Design spec: `docs/superpowers/specs/2026-06-12-v108-ember-redesign-design.md`
- Implementation plan: `docs/superpowers/plans/2026-06-12-v108-ember-redesign.md`
- Media recipe: `docs/higgsfield-media-recipe.md` · Image prompts: `docs/exercise-image-prompts.md`
- Project conventions: `CLAUDE.md`

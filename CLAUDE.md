# RYZR — Claude Code Instructions

## Project overview
RYZR is a React Native + Expo workout app with AI-generated training plans, a real-time camera-based Form Coach, social features, and an in-app store.

## Tech stack
- **Framework**: React Native + Expo SDK 54
- **Language**: TypeScript (strict)
- **Navigation**: React Navigation v7 (native stack + bottom tabs)
- **State**: Zustand (stores in `src/store/`)
- **Backend**: Supabase (auth + postgres + storage) — see `src/lib/supabase.ts`
- **Styling**: Inline StyleSheet objects (dark theme, no NativeWind classes in JSX yet)
- **AI**: Anthropic Claude API — `claude-sonnet-4-6` for plans, `claude-haiku-4-5-20251001` for form feedback
- **Form Coach**: on-device pose pipeline in `src/lib/pose/` (keypoints → rep detection → deterministic form rules). Pure TS, no RN imports, tested via `npm run test:pose`. Keypoints come from `modules/ryzr-pose` (Apple Vision / ML Kit), falling back to MoveNet. Remote switches in the Supabase `app_config` table. See `docs/form-coach.md`.
- **Subscriptions**: RevenueCat (`react-native-purchases`) — configure keys in `src/store/subscriptionStore.ts`
- **Camera**: `expo-camera`
- **Voice**: `expo-speech` (TTS, on-device) + `expo-speech-recognition` (STT, on-device, native module — requires a new native build to ship, does NOT work via EAS Update/OTA)

## Code conventions
- All screens live in `src/screens/<tab>/ScreenName.tsx`
- All navigation types in `src/types/index.ts`
- Color tokens in `src/constants/theme.ts` — always use `Colors.*`/`Gradients.*`, never hardcode hex values
- Shared UI primitives in `src/components/ui/`: `GradientButton` (primary CTAs), `StatTile`, `SectionLabel` (ember uppercase headers). Compose these on new screens for consistency.
- Exercise library in `src/constants/exercises.ts` — 30 exercises, add more here
- Exercise demo art: in the public Supabase `exercise-media` bucket, resolved by convention — looping clip `exercise-media/{id}.mp4` → still `exercise-media/{id}.png` → branded fallback (see `src/lib/exerciseMedia.ts` + `ExerciseHero`). All optional; missing media degrades gracefully. Generation prompts in `docs/exercise-image-prompts.md`.
- Never hardcode API keys — use `process.env.EXPO_PUBLIC_*` and `.env` (see `.env.example`)

## Supabase migrations
- **Every migration that creates a table in `public` must grant access in the same migration.** From 2026-10-30 Supabase no longer auto-grants the Data API roles on new tables, so a table created without grants is invisible to supabase-js, PostgREST and GraphQL — the client gets `permission denied`, not an empty result. Existing tables keep the grants they already have; this only bites new ones.
  ```sql
  grant select                         on public.your_table to anon;
  grant select, insert, update, delete on public.your_table to authenticated;
  grant select, insert, update, delete on public.your_table to service_role;
  ```
  Narrow it where the table warrants it — a config table nobody writes from the app wants `select` only for `anon`/`authenticated`. Grants are not a substitute for RLS: they say which roles may reach the table at all, RLS policies say which rows.
- This matters most when the whole schema is rebuilt — a preview branch, a second project, `supabase db reset`. Every table comes back from the migrations, so a migration missing its grants takes that environment's table down with it, not just the newest one.

## Premium vs free
- **Free**: manual workout logging, exercise library, basic progress/streak
- **Premium**: AI workout generation, Form Coach camera, advanced charts, plan regeneration
- Gate premium features by checking `useSubscriptionStore().isPremium`

## Store products
- Subscription: Monthly + Annual + Founder Lifetime via RevenueCat (live prices from RC; constants in `subscriptionStore.ts`)
- Gear tab: Amazon affiliate storefront (no in-app programs)
- Post-workout "Refuel" card (`src/components/workout/RefuelCard.tsx`) below the Done button on `WorkoutCompleteScreen`: rotates through the `Recovery & Fuel` rows of `gear_products` — each workout starts on the next product, and it cross-fades every 7s while on screen (off under Reduce Motion). Shown to all users
- Predesigned workout programs: focused sections (Flexibility, Balance, Strength, ...) backed by the Supabase `workout_programs` + `workout_program_exercises` tables (`src/lib/programs.ts`). Add/retune/retire a program in the Table Editor — no build, no OTA. `exercise_id` resolves against `src/constants/exercises.ts`; ids an installed build doesn't know are skipped, and a program left with no resolvable exercises is dropped rather than shown empty. `programToWorkout()` turns one into a `Workout` the normal session flow runs. Free for everyone; the `is_premium` column exists but nothing reads it
- Ads: one AdMob interstitial after Done on a completed workout, free users only, none in the first 3 workouts, never mid-session (`src/lib/ads.ts`). Remote off switch: `app_config.post_workout_ads_enabled`. Native module — needs a new build, not OTA. Real AdMob App IDs are in `app.json`; the interstitial ad unit IDs are constants in `src/lib/ads.ts` (dev builds always use Google's test ads). Setup notes and remaining store steps: `docs/admob-setup.md`

## Cost telemetry
- Every Claude call writes a row to the Supabase `api_usage` table via `logUsage()` in `src/lib/usage.ts`, called from the `callAnthropic`/`callWorkoutCoach` choke points in `src/lib/anthropic.ts`. Each call site passes a stable `feature` label — renaming one splits its history. Cost maths lives in `src/lib/usageCost.ts` (pure TS, no imports, `npm run test:usage`); `PRICING` there is hardcoded and must be kept in step with published rates. Queries to read it: `docs/api-cost.md`

## Setup checklist (first run)
1. Copy `.env.example` → `.env` and fill in your keys
2. Create a Supabase project at supabase.com, paste URL + anon key
3. Create a RevenueCat project, add iOS/Android API keys to `src/store/subscriptionStore.ts`
4. Get an Anthropic API key from console.anthropic.com (for production: wrap in a Supabase Edge Function)
5. Run `npm start` and scan with Expo Go

## Current state
- All screens built and wired up
- Auth flow: Welcome → Sign Up / Login
- Onboarding: 5-step flow → AI plan generation → Main tabs
- Today tab: streak badge, recovery-readiness card (wearable HRV/RHR/sleep → `src/lib/readiness.ts`), injury-risk card (`src/lib/injuryRisk.ts`), workout card, real stat tiles, session tracking, rest timer, form coach, AI coach chat with voice input/output (`CoachChatSheet.tsx`)
- Progress tab: training volume card, muscle-group heatmap, calendar heatmap, strength chart, PRs, body weight
- Store tab: Premium subscription cards + Amazon gear storefront
- Profile tab: real stats, settings, regenerate plan, sign out
- (Social removed in 1.0.8 — to be rebuilt once the user base grows)

## Design language
- **Dark mode first** — background `#0A0A0A`, surface `#1A1A1A`
- **Accent**: ember orange `#FF6B22` (gradients via `Gradients.primary`/`Gradients.ember`)
- **Typography**: system font, big numbers (32px+) for in-workout readability
- Minimum touch targets: 44px

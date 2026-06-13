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
- **Subscriptions**: RevenueCat (`react-native-purchases`) — configure keys in `src/store/subscriptionStore.ts`
- **Camera**: `expo-camera`

## Code conventions
- All screens live in `src/screens/<tab>/ScreenName.tsx`
- All navigation types in `src/types/index.ts`
- Color tokens in `src/constants/theme.ts` — always use `Colors.*`/`Gradients.*`, never hardcode hex values
- Shared UI primitives in `src/components/ui/`: `GradientButton` (primary CTAs), `StatTile`, `SectionLabel` (ember uppercase headers). Compose these on new screens for consistency.
- Exercise library in `src/constants/exercises.ts` — 30 exercises, add more here
- Exercise demo art: stylized PNGs in the Supabase `exercise-media` bucket, resolved by convention `exercise-media/{id}.png` (see `src/lib/exerciseMedia.ts`); branded fallback when missing. Generation prompts in `docs/exercise-image-prompts.md`.
- Never hardcode API keys — use `process.env.EXPO_PUBLIC_*` and `.env` (see `.env.example`)

## Premium vs free
- **Free**: manual workout logging, exercise library, basic progress/streak
- **Premium**: AI workout generation, Form Coach camera, advanced charts, plan regeneration
- Gate premium features by checking `useSubscriptionStore().isPremium`

## Store products
- Subscription: Monthly + Annual + Founder Lifetime via RevenueCat (live prices from RC; constants in `subscriptionStore.ts`)
- Gear tab: Amazon affiliate storefront (no in-app programs)

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
- Today tab: streak badge, workout card, real stat tiles, session tracking, rest timer, form coach
- Progress tab: training volume card, muscle-group heatmap, calendar heatmap, strength chart, PRs, body weight
- Store tab: Premium subscription cards + Amazon gear storefront
- Profile tab: real stats, settings, regenerate plan, sign out
- (Social removed in 1.0.8 — to be rebuilt once the user base grows)

## Design language
- **Dark mode first** — background `#0A0A0A`, surface `#1A1A1A`
- **Accent**: ember orange `#FF6B22` (gradients via `Gradients.primary`/`Gradients.ember`)
- **Typography**: system font, big numbers (32px+) for in-workout readability
- Minimum touch targets: 44px

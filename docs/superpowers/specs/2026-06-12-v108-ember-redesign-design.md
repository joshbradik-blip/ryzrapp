# RYZR 1.0.8 "Ember" — Design Spec

**Date:** 2026-06-12
**Status:** Approved pending user review
**Baseline:** main @ 2bc68b6 (v1.0.7, iOS build 16, Android versionCode 17 — unreleased; build 14 is live on the App Store)

## Goals

1. Ship the committed-but-unreleased 1.0.7 review fixes plus this update's work as **1.0.8**.
2. Fix the duplicate daily-motivation message (push + in-app) — keep in-app only.
3. Finish the forgot-password flow with an in-app reset screen and deep link.
4. Replace the YouTube WebView with branded exercise demo media.
5. Visual overhaul ("Ember" treatment) of the five core screens: Today, Workout Session, Exercise Detail, Progress, Store.
6. Remove dead surface area: Social tab, stale CLAUDE.md design language.

## Out of scope

- Rebuilding social features (deferred until user base justifies it).
- RevenueCat promotional entitlements (beta access stays email-allowlist).
- Video loops for exercise demos (static stylized images + cue walkthrough this release).
- Full reskin of onboarding/auth/profile (light consistency pass only).
- App Store screenshot updates (marketing task, not app code).

---

## 1. Functional fixes

### 1.1 Daily motivation — drop the push, keep in-app
- Remove the `scheduleAffirmationIfNeeded` call from `TodayScreen.tsx` (line ~79).
- `src/lib/notifications.ts` shrinks to a single exported cleanup helper that calls `Notifications.cancelAllScheduledNotificationsAsync()`, invoked once from app startup (App.tsx), so existing users don't receive a stale scheduled push after updating. Remove the helper and the `expo-notifications` dependency entirely in a future release.
- The app no longer requests notification permission.
- Remove `generateAffirmation` from `src/lib/anthropic.ts` if nothing else references it.
- In-app coach messages (badge queue on the FAB, generated once per calendar day in TodayScreen) are unchanged.

### 1.2 Coach FAB rename
- FAB label "Ask me" → **"Ask Coach"** (`TodayScreen.tsx` ~line 355). Badge behavior unchanged.

### 1.3 Beta tester premium bypass
- Re-add `joshbradik@gmail.com` and `sendtojoshperry@gmail.com` to `BETA_TESTERS` in `src/store/subscriptionStore.ts` (alongside `test@ryzr.com`).

### 1.4 Forgot password — complete the loop
- Add `ResetPasswordScreen` (auth stack): new password + confirm fields, strength hint, submit calls `supabase.auth.updateUser({ password })`.
- Register deep link scheme in `app.json` (`"scheme": "ryzr"`) if not present.
- `LoginScreen.handleForgotPassword` passes `redirectTo: 'ryzr://reset-password'` and surfaces errors (currently fire-and-forget). Copy uses "If an account exists for that email…" phrasing.
- App handles the incoming link: parse tokens from URL (Supabase recovery flow → `setSession`/`exchangeCodeForSession`), navigate to ResetPasswordScreen.
- Expired/invalid link → error state with "Resend email" action.
- **Dashboard step (manual):** add `ryzr://reset-password` to Supabase Auth → URL Configuration → Redirect URLs.

### 1.5 Remove Social
- Remove the Social tab from `MainTabNavigator.tsx` (5 tabs → 4: Today, Progress, Store, Profile).
- Delete `src/screens/social/SocialScreen.tsx` (already an empty-state stub since 2f205cb).
- Remove social-related navigation types from `src/types/index.ts` and any remaining references (StoreScreen FAQ copy mentions tabs — verify wording).
- Supabase social tables (if any) are left untouched — app-side removal only.

### 1.6 Store — programs already removed
- Confirmed: StoreScreen has no specialty programs (tabs are Membership | Gear | FAQ). No removal needed; section 7 is restyle-only.

### 1.7 Housekeeping
- Update CLAUDE.md design language (accent is ember orange `#FF6B22`, not electric green; store products section is stale; social references removed).
- At release: version → **1.0.8**, iOS buildNumber → **17**, Android versionCode → **18**.

---

## 2. Theme foundation

Extend `src/constants/theme.ts`:
- `Gradients.primary = ['#FF8C42', '#E8550A']` (CTA buttons), `Gradients.ember = ['#FF6B22', '#CC3A00']` (accents/charts).
- New tokens: `flame: '#FF8C42'`, `success: '#3DDC84'`.

New shared components in `src/components/ui/`:
- **GradientButton** — expo-linear-gradient CTA, dark text (#2A1004) on ember, optional trailing icon. Used for all primary actions on redesigned screens.
- **StatTile** — label (11px uppercase muted) + big value (24px+) + optional icon, surface card.
- **SectionLabel** — 11–12px uppercase ember-orange letter-spaced header (the "TODAY'S WORKOUT" / "MOST POPULAR" treatment).
- **Card** — standard surface, radius 16, border, padding; replaces ad-hoc card styles on redesigned screens.

No new dependencies: `expo-linear-gradient`, `react-native-svg`, `reanimated` already installed.

---

## 3. Today screen

Match the reference mockup:
- Header: greeting + name (existing) with streak **flame badge** (ember pill, flame icon, "N DAY STREAK").
- Today's Workout card: `SectionLabel`, workout name + meta (duration · exercise count), **numbered exercise list** (ember number circles, first 3 + "+N more"), `GradientButton` "Start Workout ⚡".
- **Stat tile row**: This Week (n/m workouts), Longest Streak (days), Total Sessions (all-time). Requires real data:
  - Streak + counts computed from completed session history (sessions store/Supabase — the history feature shipped in PR #3). Current hardcoded `streak = 0` is replaced.
- Free users: "Unlock AI Form Coach" upsell banner (ember icon, chevron, opens PremiumModal).
- FAB: renamed per 1.2, visual style unchanged apart from token alignment.

---

## 4. Workout Session screen (blend layout)

Replaces the current plain form in `WorkoutSessionScreen.tsx`:
- Top: thin ember progress bar (existing) + "EXERCISE n/m" + **Demo ▸** link (replaces "View demo →", same navigation).
- **Set pills row**: one pill per target set — completed pills show `weight×reps ✓` (dim ember), current pill highlighted (ember border), future pills muted.
- **Stage**: WEIGHT and REPS as large centered numbers (34px+) with round − / + steppers (44px touch targets); unit toggle kept. Under each: ghost hint "last: 130 × 8" from the most recent completed session containing this exercise. No history → hint hidden.
- **PR-pace nudge**: single line under the CTA when current weight exceeds the best previous weight for this exercise ("🔥 5 lb over last week — PR pace"). Computed locally from history; silent when no history.
- `GradientButton` "Log Set".
- **Ledger**: completed sets collapse into dim rows below the stage (Set 1 · 135 lb × 8 · ✓), giving the variant-B sense of progress.
- **Rest timer**: inline bar (icon + countdown + progress track + −15s/skip/+15s) in place of the popup card. Same timing/haptics logic.
- Existing flows preserved: skip remaining sets, next exercise, finish + RPE rating, Form Coach entry.

---

## 5. Exercise Detail screen — YouTube removed

- Delete the WebView/YouTube search embed entirely (and drop the `react-native-webview` import; remove the dependency if nothing else uses it).
- **Hero (≈260px)** dark-framed media area, by source:
  1. **Curated exercises (30)**: stylized image from Supabase storage, URL by convention `exercise-media/{exercise_id}.png` (public bucket). Subtle ember vignette overlay.
  2. **ExerciseDB exercises** (swapped-in): the API's demo GIF. Add `gifUrl: string` to `ExerciseDBExercise` type; render in the same dark frame.
  3. **Fallback** (missing/failed media): branded placeholder — muscle-group chips + exercise initial on surface, never a broken image.
- **Cue walkthrough**: play button on the hero starts an auto-advancing overlay stepping through Setup → Execution cues (one cue highlighted at a time, ~2.5s steps, tap to pause/advance). Pure UI animation (reanimated), no media cost.
- Rest of screen: existing tabs (Setup/Execution/Mistakes), muscle chips, swap + Form Coach CTAs restyled with shared components.
- ExerciseDB detail view (for `edb_` exercises opened from swap) gets the same hero treatment with `instructions` as cues.

### 5.1 Media pipeline
- **Bucket**: `exercise-media` on Supabase project `fuyzcssdryngvxmmjkvn`, public read, created via Supabase MCP as part of implementation.
- **Prompts deliverable**: `docs/exercise-image-prompts.md` — one copy-paste image-generation prompt per curated exercise in a single consistent style (dark charcoal 3D athletic figure, ember rim lighting, black background, matching the App Store mockup). User generates and uploads images named `{exercise_id}.png`.
- App behaves correctly with zero, some, or all images present (fallback per above).

---

## 6. Progress screen

- **Training Volume card**: SectionLabel, big total (e.g. "12,540 kg"), delta vs prior 4 weeks ("+18%"), ember bar chart by week — restyle the existing strength-chart implementation to the ember palette; no new charting library.
- **Muscle Groups heatmap** (new showpiece): front + back simplified body silhouettes (react-native-svg, ~10 non-interactive regions each), regions tinted by recent training volume per muscle group. Mapping: logged sets → exercise `muscles_primary` (full credit) and `muscles_secondary` (half credit), bucketed High/Moderate/Low over trailing 28 days. Legend row: ● High ● Moderate ● Low. Empty history → all-muted figures with a "log workouts to light this up" hint.
- Existing calendar heatmap, strength chart, PRs, body weight sections stay, restyled with shared components.

---

## 7. Store screen (restyle only)

- Membership | Gear | FAQ toggle restyled as segmented control (ember active state).
- Membership: plan cards in mockup language — SectionLabel headers, price emphasis, `GradientButton` CTAs, "BEST VALUE"-style ember badges. All purchase/restore/lifetime-slots logic unchanged.
- Gear: cards restyled (icon tile, name, desc, arrow). Amazon affiliate flow unchanged.
- FAQ: copy audit — remove references to removed features (Social), keep accordion behavior.

---

## 8. Light consistency pass

Profile, auth (Welcome/Login/SignUp/ResetPassword), onboarding screens, PremiumModal: replace primary buttons with `GradientButton`, section headers with `SectionLabel` where trivially applicable. No layout changes. Footer version string → v1.0.8.

---

## Error handling

- Media: any image/GIF load error → branded fallback frame. No spinners longer than 2s; show fallback and lazy-swap if the image arrives.
- Reset password: invalid/expired token → explanatory state + resend; network errors → retry alert; never strand the user on a blank screen.
- History-derived UI (ghost values, PR nudge, stat tiles, heatmap): all degrade silently to neutral/hidden states with empty history. No crashes on missing data.
- ExerciseDB unavailable: swap flow already degrades to local-only; heroes fall back per media rules.

## Verification

1. `npx tsc --noEmit` passes (strict).
2. Manual device pass: Today → start workout → log sets (ghost values, pills, ledger, rest bar) → demo hero (image, GIF, and fallback cases) → finish → Progress (volume card, heatmap) → Store tabs → Profile.
3. Forgot password end-to-end: request email → tap link on device → app opens reset screen → new password works for login. Expired-link path shows resend.
4. Confirm no notification permission prompt on fresh install and no scheduled notifications after update (`getAllScheduledNotificationsAsync` debug check).
5. Social tab absent; no dangling navigation routes (app builds, all tabs navigate).
6. Free vs premium gating unchanged (Form Coach, AI plan).

## Release checklist (when user says ship)

1. Bump app.json: version 1.0.8, iOS buildNumber 17, Android versionCode 18.
2. Supabase dashboard: redirect URL added (1.4); `exercise-media` bucket exists with images uploaded (or fallbacks accepted).
3. `eas build --platform ios --profile production --non-interactive` → `eas submit --platform ios --latest --non-interactive`.
4. Attach all 3 IAPs on the ASC version page before Submit for Review (standing rule from the 2.1(b) history).

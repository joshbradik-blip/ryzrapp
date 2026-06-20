# AI Coach — Per-Exercise Recall + Challenge

**Date:** 2026-06-20
**Status:** Design approved (pending written-spec review)
**Ships in:** build 22 — keep version `1.0.10` and bump the build number (build 21 isn't submitted yet); use `1.0.11` only if 1.0.10 ships first.

## Goal

During a workout, each exercise shows a **"COACH" card** that (a) reminds the user what they
did the last time they performed that exercise and (b) gives them a progressive-overload
**challenge** for today. The reminder must be accurate; the challenge is AI-generated.

This is an **advertised** feature, so reliability is a first-class requirement.

## Key decisions (locked)

1. **Delivery:** ONE batched Anthropic call at session start covering every exercise; results
   displayed inline on each exercise's COACH card as the user reaches it. (Cheapest, one
   failure point, no mid-workout latency.)
2. **Access:** **Premium only.** Free users keep the existing `last 135 × 8` inline labels plus a
   small "Unlock AI challenges" upsell chip.
3. **Recall vs challenge split:** The **recall line is built deterministically from stored data**
   (always accurate — no hallucinated numbers). **The AI writes only the challenge.**
4. **Recall data:** Full **last session** for that exercise (all sets), plus all-time best.
5. **Data foundation:** **Reconstruct + commit** the `save-workout-session` Edge Function, which
   currently exists only as a deployed (unversioned) function.

## Architecture / components

| Unit | File | Responsibility |
|---|---|---|
| Save function | `supabase/functions/save-workout-session/index.ts` (NEW) | Persist a finished session: convert weight→kg, compute volume, insert `workout_sessions` + `session_sets`. |
| Recall derivation | `src/lib/historyMetrics.ts` | Add pure `lastSessionByExercise(sets)`. |
| History state | `src/store/historyStore.ts` | Expose `lastSessionPerf` (computed in `fetchHistory`). |
| Challenge generator | `src/lib/anthropic.ts` | Add `generateExerciseChallenges(inputs, ctx)` — one `anthropic-proxy` call. |
| Session state | `src/store/workoutStore.ts` | Hold `exerciseChallenges`, `challengesLoading`; `loadChallenges()`; clear in `reset()`. |
| UI | `src/screens/today/WorkoutSessionScreen.tsx` | COACH card + trigger generation at session start; premium gate + upsell. |

The existing `workout-coach` and `anthropic-proxy` functions are **untouched**. We use the
already-deployed, version-controlled `anthropic-proxy` for the challenge call.

## Component detail

### A. `save-workout-session` Edge Function (reconstruct)

Matches `anthropic-proxy` style (Deno `serve`, same CORS, `OPTIONS` handling).

**Request body** (already sent by `workoutStore.saveSession`):
```
{ workout_id, workout_name, week_number, day_number, started_at, completed_at,
  duration_seconds, felt_rating, weight_unit: 'kg'|'lbs',
  sets: [{ exercise_name, exercise_id, set_number, reps, weight /* DISPLAY unit */ }] }
```

**Behavior:**
- Reject if no `Authorization` header (401).
- Derive the user from the JWT: a client built with `SUPABASE_ANON_KEY` + the forwarded
  `Authorization` header → `auth.getUser()` (401 if none).
- Perform inserts with the **service-role** client (`SUPABASE_SERVICE_ROLE_KEY`), setting
  `user_id` explicitly from the derived user. (Robust against missing INSERT RLS policies, while
  keeping correct user scoping — server-side secret, never exposed to the client.)
- `toKg(w) = weight_unit === 'lbs' ? w / 2.20462 : w`.
- `total_volume_kg = Σ reps × toKg(weight)`.
- Insert one `workout_sessions` row → get `id` → insert `session_sets` rows with
  `weight_kg = toKg(weight)`.
- Return `{ ok: true, session_id }` or `{ error }`.

**Table columns** (existing, created via dashboard):
`workout_sessions(id, user_id, workout_id, workout_name, week_number, day_number, started_at,
completed_at, duration_seconds, felt_rating, total_volume_kg, created_at)` ·
`session_sets(id, session_id, user_id, exercise_id, exercise_name, set_number, reps, weight_kg, created_at)`.

**Pre-deploy verification (weight units):** Before deploying over the existing function, confirm
historical `session_sets.weight_kg` are truly kg (a 100 lb lift ≈ 45). If old rows are ~2.2×
inflated (old function didn't convert), that's a separate one-time data-cleanup decision; flag,
don't silently change.

### B. `lastSessionByExercise` (pure)

```ts
export interface LastSessionPerf { sets: { weight_kg: number; reps: number }[]; at: string; }
export function lastSessionByExercise(sets: HistorySet[]): Record<string, LastSessionPerf>;
```
For each `exercise_id`: find the `session_id` of its most-recent set (max `created_at`); collect
all that exercise's sets in that session, ordered by `set_number`; `at` = that session's date.

### C. `historyStore`

Add `lastSessionPerf: Record<string, LastSessionPerf>` to state, initialized `{}`, recomputed in
`fetchHistory` via `lastSessionByExercise(sets)` alongside the existing `lastSets`/`bestWeights`.

### D. `generateExerciseChallenges` (anthropic.ts)

```ts
export interface ChallengeInput {
  exerciseId: string; name: string;
  lastSession: { weight: number; reps: number }[] | null; // DISPLAY unit
  best: number | null;                                     // DISPLAY unit
  targetSets: number; targetReps: string;
}
export async function generateExerciseChallenges(
  inputs: ChallengeInput[],
  ctx: { name: string; unit: 'kg' | 'lbs' },
): Promise<Record<string, string>>; // exerciseId -> challenge text
```
- One `claude-haiku-4-5-20251001` call via `callAnthropic` (anthropic-proxy).
- Prompt lists each exercise with its last-session sets (or "first time"), best, and today's
  target; instructs the model to return **JSON only**, keyed by `exerciseId`, each value a single
  challenge ≤ ~18 words that starts with an action verb and references the user's actual numbers
  in `unit`. First-timers get a baseline challenge.
- `max_tokens` scales with count (≈ `40 + 40 × inputs.length`, capped ~1024).
- Robust parse (`indexOf('{')`…`lastIndexOf('}')`); on any failure return `{}`.

### E. `workoutStore`

Add (NOT persisted): `exerciseChallenges: Record<string, string>`, `challengesLoading: boolean`,
`challengesSessionId: string | null`.
`loadChallenges(inputs, ctx)`: no-op if no `activeSession` or `challengesSessionId` already equals
the active session id; else set loading, call `generateExerciseChallenges`, store result, set
`challengesSessionId`. `reset()` clears all three.

### F. `WorkoutSessionScreen`

- On session start, if `isPremium`: ensure history is loaded (`fetchHistory` if `!loaded`), build
  `ChallengeInput[]` from `workout.exercises` — each exercise's `lastSessionPerf[exId]` and
  `bestWeights[exId]` converted kg→display via `kgToDisplay` — then call
  `loadChallenges(inputs, { name, unit })`.
- **COACH card** rendered after the target (`sets × reps`) line, before the set pills:
  - **Premium — recall (deterministic):** `Last time: 135×8, 135×8, 130×7` from
    `lastSessionPerf[exId]` (weights converted to display). No history → `First time — set your baseline.`
  - **Premium — challenge:** `exerciseChallenges[exId]` if present; while `challengesLoading`
    show a subtle "Coach is reviewing your last session…" placeholder; if absent after load, hide
    the challenge line (recall still shows).
  - **Free:** a compact `🔒 Unlock AI challenges` chip → premium alert (same pattern as the Form
    Coach lock). Existing inline `last X` labels remain for free recall.
- Styling: `Colors.surface` card, ember uppercase "COACH" header, primary accent for the
  challenge. Existing inline `last X` labels are left untouched.

## Data flow

```
session start ──► (premium) build inputs from historyStore.lastSessionPerf + bestWeights
              └─► workoutStore.loadChallenges() ──► anthropic.generateExerciseChallenges()
                     └─► ONE anthropic-proxy call ──► { exerciseId: challenge }  (stored)
per exercise  ──► COACH card: deterministic recall (lastSessionPerf) + AI challenge (store)
finish        ──► saveSession() ──► save-workout-session ──► workout_sessions + session_sets
                     └─► historyStore.fetchHistory() refreshes recall data for next time
```

## Error handling / edge cases

- **No history for an exercise (first time):** recall shows baseline copy; AI gets `lastSession:null`.
- **API / offline failure:** `challengesLoading=false`, `exerciseChallenges={}`; card shows recall
  only (or hides if also no history). The workout is **never blocked**.
- **ExerciseDB swaps (`edb_*` ids):** keyed by `exercise_id`, so recall/challenge work the same.
- **History not yet fetched:** screen triggers `fetchHistory` before building inputs.

## Verification

This project has **no test runner installed** (no jest/vitest in `package.json`). Verification is:
- `npx tsc --noEmit` clean (no new type errors beyond the known baseline).
- Manual on device: finish a workout → confirm rows in Supabase `session_sets` (with sane
  `weight_kg`) → restart the same workout → COACH card shows accurate recall + a challenge.
- **Optional** (only if desired): add a minimal jest setup to unit-test the two pure units
  (`lastSessionByExercise`, the challenge JSON parse). Not included by default to keep scope tight.

## Rollout

1. Deploy the function: `npx supabase functions deploy save-workout-session`.
2. Bump `app.json` → build 22 (iOS `buildNumber` 22, Android `versionCode` 22).
3. EAS build (Health native modules + this JS) → submit. One build carries Health + AI Coach.

## Out of scope (flagged, not doing)

- `CREATE TABLE` migrations for `workout_sessions`/`session_sets` (tables already exist in prod).
- EAS Update / OTA configuration.
- Touching `workout-coach` or the existing "Ask Me" chat sheet.

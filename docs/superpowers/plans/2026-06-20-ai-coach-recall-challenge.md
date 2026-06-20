# AI Coach — Recall + Challenge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During a workout, each exercise shows a "COACH" card with an accurate recall of the user's last session for that exercise plus an AI-generated progressive-overload challenge (Premium only).

**Architecture:** Recall is built deterministically from stored data (no hallucinated numbers); the Anthropic API writes only the challenge. One batched `anthropic-proxy` call at session start generates challenges for every exercise. Workout sessions are persisted by a reconstructed `save-workout-session` Edge Function so the recall data exists.

**Tech Stack:** React Native + Expo SDK 54, TypeScript, Zustand, Supabase Edge Functions (Deno), Anthropic Claude (`claude-haiku-4-5-20251001`).

**Verification note:** No test runner exists in this repo (`package.json` has no jest/vitest). Per the spec, verification is `npx tsc --noEmit` (expect **no new errors** beyond the known ~3-error baseline) plus manual on-device checks. Do **not** add a test framework.

**Spec:** `docs/superpowers/specs/2026-06-20-ai-coach-recall-challenge-design.md`

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `supabase/functions/save-workout-session/index.ts` | Create | Persist a finished session (convert weight→kg, compute volume, insert rows). |
| `src/lib/historyMetrics.ts` | Modify | Add pure `lastSessionByExercise` + `LastSessionPerf` type. |
| `src/store/historyStore.ts` | Modify | Expose `lastSessionPerf` (computed in `fetchHistory`). |
| `src/lib/anthropic.ts` | Modify | Add `generateExerciseChallenges` + `ChallengeInput` type. |
| `src/store/workoutStore.ts` | Modify | Hold challenge state; `loadChallenges`; clear in `reset`. |
| `src/screens/today/WorkoutSessionScreen.tsx` | Modify | COACH card + trigger generation at session start; premium gate. |
| `app.json` | Modify | Bump to build 22 (rollout). |

---

## Task 1: Reconstruct the `save-workout-session` Edge Function

**Files:**
- Create: `supabase/functions/save-workout-session/index.ts`

- [ ] **Step 1: Create the function file**

```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LB_PER_KG = 2.20462;

interface IncomingSet {
  exercise_name: string;
  exercise_id?: string;
  set_number: number;
  reps: number;
  weight: number; // DISPLAY unit (kg or lbs per weight_unit)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  try {
    // 1) Derive the user from the caller's JWT.
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userErr } = await authClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const unit: 'kg' | 'lbs' = body.weight_unit === 'lbs' ? 'lbs' : 'kg';
    const toKg = (w: number) => (unit === 'lbs' ? w / LB_PER_KG : w);

    const sets: IncomingSet[] = Array.isArray(body.sets) ? body.sets : [];
    const totalVolumeKg = sets.reduce(
      (sum, s) => sum + (s.reps || 0) * toKg(s.weight || 0), 0,
    );

    // 2) Insert via service role (set user_id explicitly) — robust to RLS.
    const db = createClient(url, serviceKey);

    const { data: session, error: sessErr } = await db
      .from('workout_sessions')
      .insert({
        user_id: user.id,
        workout_id: body.workout_id,
        workout_name: body.workout_name,
        week_number: body.week_number,
        day_number: body.day_number,
        started_at: body.started_at,
        completed_at: body.completed_at,
        duration_seconds: body.duration_seconds ?? null,
        felt_rating: body.felt_rating ?? null,
        total_volume_kg: Math.round(totalVolumeKg * 10) / 10,
      })
      .select('id')
      .single();
    if (sessErr || !session) throw sessErr ?? new Error('session insert failed');

    if (sets.length > 0) {
      const rows = sets.map((s) => ({
        session_id: session.id,
        user_id: user.id,
        exercise_id: s.exercise_id ?? null,
        exercise_name: s.exercise_name,
        set_number: s.set_number,
        reps: s.reps,
        weight_kg: Math.round(toKg(s.weight || 0) * 100) / 100,
      }));
      const { error: setsErr } = await db.from('session_sets').insert(rows);
      if (setsErr) throw setsErr;
    }

    return new Response(JSON.stringify({ ok: true, session_id: session.id }), {
      status: 200, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('save-workout-session error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
```

- [ ] **Step 2: Pre-deploy weight-unit sanity check (manual, do not skip)**

In the app, open an exercise you've done before and read the `last X` label, OR open the Supabase dashboard → Table Editor → `session_sets`. Confirm `weight_kg` is genuinely in kg: a 100 lb lift should be ≈ **45**, not ≈ 100.
- If values look correct → existing function already converts; this reconstruction is consistent. Proceed.
- If values are ≈ **2.2× inflated** → STOP and flag: the old function stored lbs as "kg". This needs a one-time data decision before deploying (out of scope for this task).

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/save-workout-session/index.ts
git commit -m "feat: reconstruct save-workout-session edge function"
```

(Actual deploy happens in Task 7.)

---

## Task 2: Add `lastSessionByExercise` to historyMetrics

**Files:**
- Modify: `src/lib/historyMetrics.ts`

- [ ] **Step 1: Add the type + function** (insert immediately after the existing `lastSetByExercise` function, around line 66)

```ts
export interface LastSessionPerf {
  sets: { weight_kg: number; reps: number }[];
  at: string; // date of that session (latest set's created_at)
}

// Sets from the most recent session each exercise appeared in, ordered by set_number.
export function lastSessionByExercise(sets: HistorySet[]): Record<string, LastSessionPerf> {
  // Find, per exercise, the session of its most recent set.
  const latest: Record<string, { sessionId: string; at: string }> = {};
  for (const s of sets) {
    if (!s.exercise_id) continue;
    const cur = latest[s.exercise_id];
    if (!cur || s.created_at > cur.at) {
      latest[s.exercise_id] = { sessionId: s.session_id, at: s.created_at };
    }
  }

  const out: Record<string, LastSessionPerf> = {};
  for (const [exId, { sessionId, at }] of Object.entries(latest)) {
    const sessionSets = sets
      .filter((s) => s.exercise_id === exId && s.session_id === sessionId)
      .sort((a, b) => a.set_number - b.set_number)
      .map((s) => ({ weight_kg: s.weight_kg, reps: s.reps }));
    out[exId] = { sets: sessionSets, at };
  }
  return out;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (same baseline as before).

- [ ] **Step 3: Commit**

```bash
git add src/lib/historyMetrics.ts
git commit -m "feat: lastSessionByExercise derivation for recall"
```

---

## Task 3: Expose `lastSessionPerf` from historyStore

**Files:**
- Modify: `src/store/historyStore.ts`

- [ ] **Step 1: Extend the imports** — change the existing import block from `../lib/historyMetrics` (lines 3-12) to add `lastSessionByExercise` and `LastSessionPerf`:

```ts
import {
  HistorySession,
  HistorySet,
  HeatLevel,
  LastSessionPerf,
  computeStreaks,
  lastSetByExercise,
  lastSessionByExercise,
  bestWeightByExercise,
  weeklyVolume,
  muscleHeat,
} from '../lib/historyMetrics';
```

- [ ] **Step 2: Add the field to the `HistoryState` interface** — after the `lastSets` line (around line 27):

```ts
  lastSets: Record<string, { weight_kg: number; reps: number }>;
  lastSessionPerf: Record<string, LastSessionPerf>;
```

- [ ] **Step 3: Add it to the initial state** — after `lastSets: {},` (around line 54):

```ts
  lastSets: {},
  lastSessionPerf: {},
```

- [ ] **Step 4: Compute it in `fetchHistory`** — in the `set({ ... })` call, after the `lastSets: lastSetByExercise(sets),` line (around line 93):

```ts
      lastSets: lastSetByExercise(sets),
      lastSessionPerf: lastSessionByExercise(sets),
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/store/historyStore.ts
git commit -m "feat: expose lastSessionPerf from historyStore"
```

---

## Task 4: Add `generateExerciseChallenges` to anthropic.ts

**Files:**
- Modify: `src/lib/anthropic.ts`

- [ ] **Step 1: Add the type + function** (append to the end of the file; it uses the module-private `callAnthropic` already defined at the top)

```ts
export interface ChallengeInput {
  exerciseId: string;
  name: string;
  lastSession: { weight: number; reps: number }[] | null; // DISPLAY unit
  best: number | null;                                     // DISPLAY unit
  targetSets: number;
  targetReps: string;
}

// One batched call -> { exerciseId: challenge text }. Recall is built client-side
// (deterministic); the model writes ONLY the challenge.
export async function generateExerciseChallenges(
  inputs: ChallengeInput[],
  ctx: { name: string; unit: 'kg' | 'lbs' },
): Promise<Record<string, string>> {
  if (inputs.length === 0) return {};

  const lines = inputs.map((e) => {
    const last = e.lastSession && e.lastSession.length > 0
      ? e.lastSession.map((s) => `${s.weight}${ctx.unit}x${s.reps}`).join(', ')
      : 'no previous record (first time)';
    const best = e.best != null ? `${e.best}${ctx.unit}` : 'n/a';
    return `- id "${e.exerciseId}" | ${e.name} | last time: ${last} | best: ${best} | today's target: ${e.targetSets}x${e.targetReps}`;
  }).join('\n');

  const prompt = `You are RYZR's strength coach writing a punchy progressive-overload challenge for ${ctx.name}'s workout today.

For EACH exercise below, write ONE short challenge (max 18 words) that:
- starts with an action verb
- references their actual numbers in ${ctx.unit}
- pushes a sensible progression (add a rep, add weight, tighter tempo, or match a PR)
- for first-time exercises, gives a smart baseline-setting challenge

EXERCISES:
${lines}

Return ONLY valid JSON, no markdown, mapping each exercise id to its challenge string:
{ ${inputs.map((e) => `"${e.exerciseId}": "..."`).join(', ')} }`;

  try {
    const data = await callAnthropic({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.min(1024, 40 + 40 * inputs.length),
      messages: [{ role: 'user', content: prompt }],
    });
    const text: string = data.content?.[0]?.text ?? '{}';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) return {};
    const parsed = JSON.parse(text.slice(start, end + 1));
    const out: Record<string, string> = {};
    for (const e of inputs) {
      const v = parsed[e.exerciseId];
      if (typeof v === 'string' && v.trim()) out[e.exerciseId] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/anthropic.ts
git commit -m "feat: generateExerciseChallenges batched challenge generator"
```

---

## Task 5: Add challenge state to workoutStore

**Files:**
- Modify: `src/store/workoutStore.ts`

- [ ] **Step 1: Import the generator + type** — add after the existing `import { useHistoryStore } from './historyStore';` (line 7):

```ts
import { generateExerciseChallenges, ChallengeInput } from '../lib/anthropic';
```

- [ ] **Step 2: Extend the `WorkoutState` interface** — add these fields after `lastCoachMessageDate: string | null;` (around line 27):

```ts
  exerciseChallenges: Record<string, string>;
  challengesLoading: boolean;
  challengesSessionId: string | null;
```

  and add this method signature after `saveSession: (weightUnit: 'kg' | 'lbs') => Promise<void>;` (around line 44):

```ts
  loadChallenges: (
    inputs: ChallengeInput[],
    ctx: { name: string; unit: 'kg' | 'lbs' },
  ) => Promise<void>;
```

- [ ] **Step 3: Add the initial state** — after `lastCoachMessageDate: null,` (around line 115):

```ts
  exerciseChallenges: {},
  challengesLoading: false,
  challengesSessionId: null,
```

- [ ] **Step 4: Implement `loadChallenges`** — add immediately after the `saveSession` action (after its closing `},`, around line 240):

```ts
  loadChallenges: async (inputs, ctx) => {
    const { activeSession, challengesSessionId, challengesLoading } = get();
    if (!activeSession) return;
    if (challengesLoading || challengesSessionId === activeSession.id) return;
    set({ challengesLoading: true });
    try {
      const result = await generateExerciseChallenges(inputs, ctx);
      set({
        exerciseChallenges: result,
        challengesSessionId: activeSession.id,
        challengesLoading: false,
      });
    } catch {
      set({ challengesLoading: false });
    }
  },
```

- [ ] **Step 5: Clear challenge state in `reset`** — replace the existing `reset` action (around lines 179-187) with:

```ts
  reset: () =>
    set({
      activeSession: null,
      activeSets: [],
      currentExerciseIndex: 0,
      currentSetIndex: 0,
      restTimerActive: false,
      restSecondsRemaining: 0,
      exerciseChallenges: {},
      challengesLoading: false,
      challengesSessionId: null,
    }),
```

  (No change to `partialize` — these fields are intentionally not persisted.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/store/workoutStore.ts
git commit -m "feat: per-session AI challenge state in workoutStore"
```

---

## Task 6: COACH card in WorkoutSessionScreen

**Files:**
- Modify: `src/screens/today/WorkoutSessionScreen.tsx`

- [ ] **Step 1: Add the auth store import + ChallengeInput import** — after the existing `import { useHistoryStore } from '../../store/historyStore';` (line 17):

```ts
import { useAuthStore } from '../../store/authStore';
import { ChallengeInput } from '../../lib/anthropic';
```

- [ ] **Step 2: Pull the new state from the stores** — replace the two destructuring lines (lines 38 and 41):

```ts
  const { workouts, todayWorkout, startSession, logSet, nextExercise, currentExerciseIndex, completeSession, exerciseChallenges, challengesLoading, loadChallenges } = useWorkoutStore();
```
```ts
  const { lastSets, bestWeights, lastSessionPerf } = useHistoryStore();
```

  and add, after line 41:

```ts
  const userId = useAuthStore((s) => s.session?.user?.id);
```

- [ ] **Step 3: Replace the session-start effect** — replace the existing effect (lines 57-59):

```ts
  useEffect(() => {
    if (!workout) return;
    startSession(workout.id);
    if (!isPremium) return;

    (async () => {
      const hist = useHistoryStore.getState();
      if (!hist.loaded && userId) await hist.fetchHistory(userId);
      const fresh = useHistoryStore.getState();
      const u = useProfileStore.getState().profile?.weight_unit ?? 'lbs';
      const inputs: ChallengeInput[] = workout.exercises.map((we) => {
        const id = we.exercise.id;
        const ls = fresh.lastSessionPerf[id];
        const b = fresh.bestWeights[id];
        return {
          exerciseId: id,
          name: we.exercise.name,
          lastSession: ls ? ls.sets.map((s) => ({ weight: kgToDisplay(s.weight_kg, u), reps: s.reps })) : null,
          best: b ? kgToDisplay(b.weight_kg, u) : null,
          targetSets: we.target_sets,
          targetReps: we.target_reps,
        };
      });
      loadChallenges(inputs, { name: useProfileStore.getState().profile?.name ?? 'Athlete', unit: u });
    })();
  }, []);
```

- [ ] **Step 4: Compute recall + challenge for the current exercise** — after the `const prDeltaKg = ...` line (around line 95):

```ts
  const lastSession = lastSessionPerf[exId];
  const recallText = lastSession && lastSession.sets.length > 0
    ? lastSession.sets.map((s) => `${fmtWeight(s.weight_kg, unit)}×${s.reps}`).join(', ')
    : null;
  const challengeText = exerciseChallenges[exId];
```

- [ ] **Step 5: Render the COACH card** — insert between the target line and the set pills. After the closing `</Text>` of the `sets × reps` block (around line 206, right before the `{/* Set pills */}` comment):

```tsx
        {/* COACH card */}
        {isPremium ? (
          <View style={{ backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.primary + '33', padding: 14, marginBottom: 20 }}>
            <Text style={{ color: Colors.primary, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 8 }}>COACH</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: (challengeText || challengesLoading) ? 8 : 0 }}>
              <Ionicons name="time-outline" size={15} color={Colors.textSecondary} />
              <Text style={{ color: Colors.textSecondary, fontSize: 13, flex: 1 }}>
                {recallText ? `Last time: ${recallText}` : 'First time — set your baseline.'}
              </Text>
            </View>
            {challengesLoading && !challengeText ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="barbell-outline" size={15} color={Colors.muted} />
                <Text style={{ color: Colors.muted, fontSize: 13, fontStyle: 'italic', flex: 1 }}>Coach is reviewing your last session…</Text>
              </View>
            ) : challengeText ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="flame" size={15} color={Colors.primary} />
                <Text style={{ color: Colors.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{challengeText}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => Alert.alert('Premium Feature', 'Upgrade to RYZR Premium to unlock AI challenges that push you past last time.')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: Colors.primary + '44', padding: 12, marginBottom: 20 }}
          >
            <Ionicons name="lock-closed-outline" size={16} color={Colors.primary} />
            <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>Unlock AI challenges with Premium</Text>
          </TouchableOpacity>
        )}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Manual verification (on device / Expo Go, premium account)**

1. Start a workout → COACH card appears under the target line. First-ever exercise shows "First time — set your baseline." and a baseline challenge appears within ~2-3s.
2. Finish the workout (this calls `saveSession`).
3. Start the same workout again → COACH card now shows "Last time: …" with the real numbers + a progression challenge.
4. With a **free** account → card is replaced by the "Unlock AI challenges with Premium" chip; tapping it shows the upgrade alert.
5. Airplane mode → start a workout → no crash; recall still shows (from cached history), challenge line simply doesn't appear.

- [ ] **Step 8: Commit**

```bash
git add src/screens/today/WorkoutSessionScreen.tsx
git commit -m "feat: COACH card with recall + AI challenge on workout screen"
```

---

## Task 7: Rollout — deploy function + bump to build 22

**Files:**
- Modify: `app.json`

- [ ] **Step 1: Deploy the Edge Function** (requires Supabase login; user-run)

```bash
npx supabase login        # if not already authenticated
npx supabase functions deploy save-workout-session --project-ref fuyzcssdryngvxmmjkvn
```
Expected: "Deployed Function save-workout-session". Then complete one workout in the app and confirm a new row appears in `session_sets` with a sane `weight_kg`.

- [ ] **Step 2: Bump build numbers** — in `app.json`, change `ios.buildNumber` from `"21"` to `"22"` (line 22) and `android.versionCode` from `21` to `22` (line 32). Keep `version` as `1.0.10`.

- [ ] **Step 3: Commit**

```bash
git add app.json
git commit -m "chore: bump to iOS build 22 / Android versionCode 22"
```

- [ ] **Step 4: Push everything**

```bash
git push origin main
```

- [ ] **Step 5: Build + submit** (user-run; carries Health native modules + this JS feature)

```bash
eas build --platform ios --profile production --non-interactive
eas submit --platform ios --latest --non-interactive
# Android: eas build --platform android --profile production --non-interactive
```

---

## Self-Review

**Spec coverage:**
- save-workout-session reconstruct → Task 1 ✅
- `lastSessionByExercise` → Task 2 ✅
- historyStore `lastSessionPerf` → Task 3 ✅
- `generateExerciseChallenges` (anthropic-proxy, haiku, batched, JSON+fallback) → Task 4 ✅
- workoutStore challenge state + `loadChallenges` + reset → Task 5 ✅
- COACH card: deterministic recall + AI challenge, premium gate + upsell, loading/error/first-time/offline states → Task 6 ✅
- Weight pre-deploy check → Task 1 Step 2 ✅
- Rollout (deploy, build 22) → Task 7 ✅

**Type consistency:** `LastSessionPerf`, `ChallengeInput`, `lastSessionPerf`, `exerciseChallenges`, `challengesLoading`, `challengesSessionId`, `loadChallenges` are defined once (Tasks 2/4/5) and used with matching names/signatures in Tasks 3/5/6. Recall uses `fmtWeight` (already in the screen) and challenge input conversion uses `kgToDisplay` (already imported in the screen).

**Placeholder scan:** none — every code step contains full content.

**Note on verification:** TDD is intentionally replaced by `tsc --noEmit` + manual on-device steps because the repo has no test runner (per spec).

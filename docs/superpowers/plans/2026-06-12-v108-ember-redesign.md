# RYZR 1.0.8 "Ember" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 1.0.8: kill the duplicate motivation push, finish forgot-password with deep links, remove social leftovers, replace YouTube with branded exercise media, and apply the Ember visual treatment to Today / Session / Exercise Detail / Progress / Store — powered by a new workout-history read layer.

**Architecture:** A new `historyStore` reads `workout_sessions` + `session_sets` from Supabase (RLS read policies already exist) and pure functions in `src/lib/historyMetrics.ts` derive streaks, ghost values, PR baselines, weekly volume, and muscle-group heat. Shared UI primitives (`GradientButton`, `StatTile`, `SectionLabel`) implement the Ember look once; screens compose them. Exercise media resolves by convention from a public Supabase bucket with ExerciseDB GIF and branded-placeholder fallbacks.

**Tech Stack:** React Native + Expo SDK 54, TypeScript strict, Zustand, Supabase JS v2, expo-linear-gradient, react-native-svg, reanimated. No new dependencies. No test runner in repo — each task verifies with `npx tsc --noEmit` plus listed manual checks.

**Spec:** `docs/superpowers/specs/2026-06-12-v108-ember-redesign-design.md`

**Verified facts (don't re-derive):**
- `Colors.primary` is already `#FF6B22`; no `#00FF88` remains in src.
- Social tab already absent from `MainTabNavigator.tsx`; only `src/screens/social/SocialScreen.tsx` + types remain.
- StoreScreen has no specialty programs (tabs: membership | gear | faq).
- Supabase project `fuyzcssdryngvxmmjkvn`. Tables: `workout_sessions(id, user_id, workout_id, workout_name, week_number, day_number, started_at, completed_at, duration_seconds, felt_rating int, total_volume_kg, created_at)`, `session_sets(id, session_id, user_id, exercise_name, exercise_id text, set_number, reps, weight_kg numeric, created_at)`. SELECT policies: `auth.uid() = user_id` on both.
- `app.json` has no `scheme`. `supabase.ts` uses `detectSessionInUrl: false`.
- `App.tsx` line 2: `import './src/lib/notifications';`

---

### Task 1: Quick fixes — notifications, FAB label, beta emails

**Files:**
- Modify: `src/lib/notifications.ts` (gut to cleanup helper)
- Modify: `App.tsx:2`
- Modify: `src/screens/today/TodayScreen.tsx` (~24, ~79, ~355)
- Modify: `src/store/subscriptionStore.ts` (BETA_TESTERS)
- Modify: `src/lib/anthropic.ts` (remove `generateAffirmation` if unreferenced)

- [ ] **Step 1: Replace notifications.ts wholesale**

```typescript
import * as Notifications from 'expo-notifications';

// Daily motivation now arrives only as in-app coach messages (TodayScreen).
// This one-release helper clears pushes scheduled by <=1.0.7 builds.
// Remove this file and the expo-notifications dependency in a future release.
export async function cancelLegacyScheduledNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // best-effort cleanup
  }
}
```

- [ ] **Step 2: App.tsx — swap side-effect import for cleanup call**

Replace line 2 with `import { cancelLegacyScheduledNotifications } from './src/lib/notifications';` and inside `App()` before return add:

```typescript
React.useEffect(() => { cancelLegacyScheduledNotifications(); }, []);
```

- [ ] **Step 3: TodayScreen — remove push scheduling, rename FAB**

Delete the `scheduleAffirmationIfNeeded` import (line 24) and the `useEffect` calling it (lines 77–81). Change FAB label (line ~355) `Ask me` → `Ask Coach`.

- [ ] **Step 4: subscriptionStore — beta emails**

```typescript
export const BETA_TESTERS: string[] = [
  'test@ryzr.com',
  'joshbradik@gmail.com',
  'sendtojoshperry@gmail.com',
];
```

- [ ] **Step 5: Remove `generateAffirmation` from `src/lib/anthropic.ts`** — first `grep -r generateAffirmation src/` to confirm notifications.ts was the only consumer; delete the function.

- [ ] **Step 6: Verify** — `npx tsc --noEmit` passes; `grep -r scheduleAffirmationIfNeeded src/` returns nothing.

- [ ] **Step 7: Commit** — `fix: drop motivation push notification, rename FAB to Ask Coach, restore beta emails`

---

### Task 2: Delete social leftovers

**Files:**
- Delete: `src/screens/social/SocialScreen.tsx`
- Modify: `src/types/index.ts` (remove `SocialPost`, `Challenge`; remove `Social` from `MainTabParamList` if present; remove `StoreProduct` if unreferenced)

- [ ] **Step 1: Delete the screen file**, then `grep -ri "SocialScreen\|SocialPost\|Challenge\b\|StoreProduct" src/` and remove every dangling reference/type. `Challenge` must not match `generatePreWorkoutChallenge` — that stays.
- [ ] **Step 2: Verify** — `npx tsc --noEmit` passes.
- [ ] **Step 3: Commit** — `chore: remove social screen and dead social/store-product types`

---

### Task 3: Theme foundation — tokens + Ember primitives

**Files:**
- Modify: `src/constants/theme.ts`
- Create: `src/components/ui/GradientButton.tsx`
- Create: `src/components/ui/StatTile.tsx`
- Create: `src/components/ui/SectionLabel.tsx`
- (Reuse existing `src/components/ui/Card.tsx` as-is.)

- [ ] **Step 1: theme.ts additions**

```typescript
export const Gradients = {
  primary: ['#FF8C42', '#E8550A'] as const,
  ember: ['#FF6B22', '#CC3A00'] as const,
};
// add to Colors:
//   flame: '#FF8C42',
//   success: '#3DDC84',
//   onPrimary: '#2A1004',
```

- [ ] **Step 2: GradientButton**

```tsx
import React from 'react';
import { Text, TouchableOpacity, ViewStyle, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients, BorderRadius } from '../../constants/theme';

interface Props {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}

export function GradientButton({ title, onPress, icon, disabled, loading, style }: Props) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled || loading} activeOpacity={0.85} style={style}>
      <LinearGradient
        colors={[...Gradients.primary]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{
          borderRadius: BorderRadius.lg, paddingVertical: 16, minHeight: 52,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {loading ? <ActivityIndicator color={Colors.onPrimary} /> : (
          <>
            <Text style={{ color: Colors.onPrimary, fontSize: 17, fontWeight: '800' }}>{title}</Text>
            {icon && <Ionicons name={icon} size={18} color={Colors.onPrimary} />}
          </>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 3: StatTile**

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, BorderRadius } from '../../constants/theme';

interface Props {
  label: string;
  value: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
}

export function StatTile({ label, value, sub, icon, iconColor = Colors.primary }: Props) {
  return (
    <View style={{
      flex: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg,
      borderWidth: 1, borderColor: Colors.border, padding: 14, alignItems: 'center',
    }}>
      <Text style={{ color: Colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textAlign: 'center' }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900', marginTop: 4 }}>{value}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
        {sub ? <Text style={{ color: Colors.textSecondary, fontSize: 12 }}>{sub}</Text> : null}
        {icon ? <Ionicons name={icon} size={13} color={iconColor} /> : null}
      </View>
    </View>
  );
}
```

- [ ] **Step 4: SectionLabel**

```tsx
import React from 'react';
import { Text, TextStyle } from 'react-native';
import { Colors } from '../../constants/theme';

export function SectionLabel({ children, style }: { children: string; style?: TextStyle }) {
  return (
    <Text style={[{ color: Colors.primary, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 }, style]}>
      {children.toUpperCase()}
    </Text>
  );
}
```

- [ ] **Step 5: Verify** — `npx tsc --noEmit`.
- [ ] **Step 6: Commit** — `feat: ember theme tokens and shared GradientButton/StatTile/SectionLabel`

---

### Task 4: Workout-history read layer

**Files:**
- Create: `src/lib/historyMetrics.ts` (pure derivations — no I/O)
- Create: `src/store/historyStore.ts` (fetch + cache)
- Modify: `src/store/workoutStore.ts` (`saveSession` triggers refresh)

- [ ] **Step 1: historyMetrics.ts**

```typescript
export interface HistorySession {
  id: string;
  workout_name: string;
  started_at: string;
  completed_at: string | null;
  total_volume_kg: number | null;
}

export interface HistorySet {
  session_id: string;
  exercise_id: string | null;
  exercise_name: string;
  set_number: number;
  reps: number;
  weight_kg: number;
  created_at: string;
}

function dayKey(iso: string): string {
  return new Date(iso).toDateString();
}

// Current streak: consecutive days with >=1 session ending today or yesterday.
// Longest streak: max consecutive-day run anywhere in history.
export function computeStreaks(sessions: HistorySession[]): { current: number; longest: number } {
  const days = [...new Set(sessions.map((s) => dayKey(s.started_at)))]
    .map((d) => new Date(d).getTime())
    .sort((a, b) => a - b);
  if (days.length === 0) return { current: 0, longest: 0 };
  const DAY = 86400000;
  let longest = 1, run = 1;
  for (let i = 1; i < days.length; i++) {
    run = days[i] - days[i - 1] === DAY ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const last = days[days.length - 1];
  const gap = (today.getTime() - last) / DAY;
  let current = 0;
  if (gap <= 1) {
    current = 1;
    for (let i = days.length - 1; i > 0; i--) {
      if (days[i] - days[i - 1] === DAY) current++;
      else break;
    }
  }
  return { current, longest };
}

// Most recent logged set(s) per exercise: { exercise_id: { weight_kg, reps } }
export function lastSetByExercise(sets: HistorySet[]): Record<string, { weight_kg: number; reps: number }> {
  const sorted = [...sets].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const out: Record<string, { weight_kg: number; reps: number }> = {};
  for (const s of sorted) if (s.exercise_id) out[s.exercise_id] = { weight_kg: s.weight_kg, reps: s.reps };
  return out;
}

// All-time best weight per exercise (for PR nudge): { exercise_id: { weight_kg, at } }
export function bestWeightByExercise(sets: HistorySet[]): Record<string, { weight_kg: number; at: string }> {
  const out: Record<string, { weight_kg: number; at: string }> = {};
  for (const s of sets) {
    if (!s.exercise_id || s.weight_kg <= 0) continue;
    if (!out[s.exercise_id] || s.weight_kg > out[s.exercise_id].weight_kg) {
      out[s.exercise_id] = { weight_kg: s.weight_kg, at: s.created_at };
    }
  }
  return out;
}

// Volume per ISO week for the trailing N weeks (oldest first).
export function weeklyVolume(sessions: HistorySession[], weeks: number): { label: string; volumeKg: number }[] {
  const buckets: { start: Date; volumeKg: number }[] = [];
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  for (let i = weeks - 1; i >= 0; i--) {
    const start = new Date(monday); start.setDate(monday.getDate() - i * 7);
    buckets.push({ start, volumeKg: 0 });
  }
  for (const s of sessions) {
    const t = new Date(s.started_at);
    for (let i = buckets.length - 1; i >= 0; i--) {
      if (t >= buckets[i].start) { buckets[i].volumeKg += s.total_volume_kg ?? 0; break; }
    }
  }
  return buckets.map((b) => ({
    label: `${b.start.getMonth() + 1}/${b.start.getDate()}`,
    volumeKg: Math.round(b.volumeKg),
  }));
}

export type HeatLevel = 'high' | 'moderate' | 'low' | 'none';

// Muscle-group heat over trailing 28 days. Primary muscles get full credit,
// secondary half. Only local-library exercises contribute (edb_ ids lack muscle data).
export function muscleHeat(
  sets: HistorySet[],
  muscleLookup: (exerciseId: string) => { primary: string[]; secondary: string[] } | null
): Record<string, HeatLevel> {
  const cutoff = Date.now() - 28 * 86400000;
  const score: Record<string, number> = {};
  for (const s of sets) {
    if (!s.exercise_id || new Date(s.created_at).getTime() < cutoff) continue;
    const m = muscleLookup(s.exercise_id);
    if (!m) continue;
    for (const p of m.primary) score[p] = (score[p] ?? 0) + 1;
    for (const sec of m.secondary) score[sec] = (score[sec] ?? 0) + 0.5;
  }
  const values = Object.values(score);
  if (values.length === 0) return {};
  const max = Math.max(...values);
  const out: Record<string, HeatLevel> = {};
  for (const [muscle, v] of Object.entries(score)) {
    out[muscle] = v >= max * 0.66 ? 'high' : v >= max * 0.33 ? 'moderate' : 'low';
  }
  return out;
}
```

- [ ] **Step 2: historyStore.ts**

```typescript
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  HistorySession, HistorySet,
  computeStreaks, lastSetByExercise, bestWeightByExercise, weeklyVolume, muscleHeat, HeatLevel,
} from '../lib/historyMetrics';
import { getExerciseById } from '../constants/exercises';

interface HistoryState {
  sessions: HistorySession[];
  sets: HistorySet[];
  loaded: boolean;
  loading: boolean;
  fetchHistory: (userId: string) => Promise<void>;

  // derived (recomputed on fetch)
  currentStreak: number;
  longestStreak: number;
  totalSessions: number;
  thisWeekSessions: number;
  lastSets: Record<string, { weight_kg: number; reps: number }>;
  bestWeights: Record<string, { weight_kg: number; at: string }>;
  volumeByWeek: { label: string; volumeKg: number }[];
  muscleHeatMap: Record<string, HeatLevel>;
}

function muscleLookup(exerciseId: string) {
  const ex = getExerciseById(exerciseId);
  return ex ? { primary: ex.muscles_primary, secondary: ex.muscles_secondary } : null;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  sessions: [], sets: [], loaded: false, loading: false,
  currentStreak: 0, longestStreak: 0, totalSessions: 0, thisWeekSessions: 0,
  lastSets: {}, bestWeights: {}, volumeByWeek: [], muscleHeatMap: {},

  fetchHistory: async (userId: string) => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const [sessRes, setsRes] = await Promise.all([
        supabase.from('workout_sessions')
          .select('id, workout_name, started_at, completed_at, total_volume_kg')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(500),
        supabase.from('session_sets')
          .select('session_id, exercise_id, exercise_name, set_number, reps, weight_kg, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);
      if (sessRes.error || setsRes.error) throw sessRes.error ?? setsRes.error;
      const sessions = (sessRes.data ?? []) as HistorySession[];
      const sets = (setsRes.data ?? []) as HistorySet[];

      const { current, longest } = computeStreaks(sessions);
      const weekStart = new Date(); weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
      set({
        sessions, sets, loaded: true, loading: false,
        currentStreak: current,
        longestStreak: longest,
        totalSessions: sessions.length,
        thisWeekSessions: sessions.filter((s) => new Date(s.started_at) >= weekStart).length,
        lastSets: lastSetByExercise(sets),
        bestWeights: bestWeightByExercise(sets),
        volumeByWeek: weeklyVolume(sessions, 8),
        muscleHeatMap: muscleHeat(sets, muscleLookup),
      });
    } catch {
      set({ loading: false, loaded: true }); // degrade silently; UI shows empty states
    }
  },
}));
```

- [ ] **Step 3: Refresh after save** — in `workoutStore.saveSession`, after the successful `functions.invoke('save-workout-session')`, get the user id (`(await supabase.auth.getUser()).data.user?.id`) and call `useHistoryStore.getState().fetchHistory(userId)` (import at top; fire-and-forget with `.catch(() => {})`).

- [ ] **Step 4: Verify** — `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `feat: workout history read layer with streaks, ghost sets, PR baselines, volume, muscle heat`

---

### Task 5: Forgot-password deep link + reset screen

**Files:**
- Modify: `app.json` (add `"scheme": "ryzr"` at the top level of `expo`)
- Modify: `src/store/authStore.ts` (add `passwordRecovery` flag)
- Modify: `src/navigation/RootNavigator.tsx` (URL handling + conditional screen)
- Create: `src/screens/auth/ResetPasswordScreen.tsx`
- Modify: `src/screens/auth/LoginScreen.tsx` (`handleForgotPassword`)
- Modify: `src/types/index.ts` (`ResetPassword: undefined` in `RootStackParamList`)

- [ ] **Step 1: app.json** — add `"scheme": "ryzr"` under `expo`.

- [ ] **Step 2: authStore flag** — add to the store interface and implementation:

```typescript
passwordRecovery: boolean;
setPasswordRecovery: (v: boolean) => void;
// impl: passwordRecovery: false, setPasswordRecovery: (v) => set({ passwordRecovery: v }),
```

- [ ] **Step 3: RootNavigator — handle recovery links**

Add imports: `import * as Linking from 'expo-linking';` and `ResetPasswordScreen`. Inside the existing first `useEffect`, add:

```typescript
const handleUrl = async (url: string | null) => {
  if (!url || !url.includes('reset-password')) return;
  try {
    const parsed = new URL(url.replace('#', '?'));  // tokens may arrive in the fragment
    const code = parsed.searchParams.get('code');
    const access_token = parsed.searchParams.get('access_token');
    const refresh_token = parsed.searchParams.get('refresh_token');
    if (code) await supabase.auth.exchangeCodeForSession(code);
    else if (access_token && refresh_token) await supabase.auth.setSession({ access_token, refresh_token });
    else return;
    useAuthStore.getState().setPasswordRecovery(true);
  } catch {
    // invalid/expired link — login screen still reachable; user can resend
  }
};
Linking.getInitialURL().then(handleUrl);
const urlSub = Linking.addEventListener('url', (e) => handleUrl(e.url));
// add urlSub.remove() to the effect cleanup
```

Also in the existing `onAuthStateChange` callback: `if (_event === 'PASSWORD_RECOVERY') useAuthStore.getState().setPasswordRecovery(true);`

In the navigator JSX, before the `!session` branch:

```tsx
{passwordRecovery && session ? (
  <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
) : /* existing branches */}
```

(`passwordRecovery` comes from `useAuthStore()`.)

- [ ] **Step 4: ResetPasswordScreen**

```tsx
import React, { useState } from 'react';
import { View, Text, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { Input } from '../../components/ui/Input';
import { GradientButton } from '../../components/ui/GradientButton';
import { Colors } from '../../constants/theme';

export function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const { setPasswordRecovery } = useAuthStore();

  const submit = async () => {
    if (password.length < 8) { Alert.alert('Too short', 'Password must be at least 8 characters.'); return; }
    if (password !== confirm) { Alert.alert('No match', 'Passwords do not match.'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { Alert.alert('Error', 'Could not update password. The link may have expired — request a new one from the login screen.'); return; }
    setPasswordRecovery(false);
    Alert.alert('Password updated', 'You are now signed in.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: Colors.text, fontSize: 26, fontWeight: '900', marginBottom: 8 }}>Set a new password</Text>
        <Text style={{ color: Colors.textSecondary, fontSize: 15, marginBottom: 24 }}>At least 8 characters.</Text>
        <Input label="New password" value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        <Input label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry placeholder="••••••••" />
        <GradientButton title="Update password" onPress={submit} loading={saving} style={{ marginTop: 16 }} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
```

(Match `Input`'s actual props when implementing — check `src/components/ui/Input.tsx`.)

- [ ] **Step 5: LoginScreen.handleForgotPassword**

```typescript
const handleForgotPassword = async () => {
  if (!email.trim()) {
    Alert.alert('Enter your email', 'Please enter your email address first.');
    return;
  }
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: 'ryzr://reset-password',
  });
  if (error) {
    Alert.alert('Something went wrong', 'Could not send the reset email. Check your connection and try again.');
    return;
  }
  Alert.alert('Check your email', `If an account exists for ${email.trim()}, a password reset link is on its way.`);
};
```

- [ ] **Step 6: USER ACTION (flag in summary, not blocking):** Supabase Dashboard → Authentication → URL Configuration → add `ryzr://reset-password` to Redirect URLs.

- [ ] **Step 7: Verify** — `npx tsc --noEmit`; after a dev build, `npx uri-scheme open "ryzr://reset-password?access_token=x&refresh_token=y" --ios` opens the app without crashing (lands on login since tokens are fake).
- [ ] **Step 8: Commit** — `feat: complete forgot-password flow with ryzr:// deep link and reset screen`

---

### Task 6: Exercise media — bucket, URL convention, gifUrl

**Files:**
- Supabase (MCP `apply_migration`): create bucket
- Create: `src/lib/exerciseMedia.ts`
- Modify: `src/types/index.ts` (`ExerciseDBExercise.gifUrl?`, `Exercise.media_url?`)
- Modify: `src/store/workoutStore.ts` (`buildReplacementExercise` carries gifUrl)

- [ ] **Step 1: Create bucket** (idempotent migration via Supabase MCP, project `fuyzcssdryngvxmmjkvn`):

```sql
insert into storage.buckets (id, name, public)
values ('exercise-media', 'exercise-media', true)
on conflict (id) do nothing;
```

- [ ] **Step 2: exerciseMedia.ts**

```typescript
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';

// Convention: curated exercises have a stylized PNG at exercise-media/{id}.png.
// Upload via Supabase dashboard; no app release needed to add or swap art.
export function exerciseImageUrl(exerciseId: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/exercise-media/${exerciseId}.png`;
}
```

- [ ] **Step 3: types** — add `gifUrl?: string;` to `ExerciseDBExercise`, `media_url?: string;` to `Exercise`.

- [ ] **Step 4: workoutStore** — in `buildReplacementExercise`, add `media_url: db.gifUrl,` to the returned object.

- [ ] **Step 5: Verify** — `npx tsc --noEmit`; `SELECT id, public FROM storage.buckets WHERE id='exercise-media'` returns one public row.
- [ ] **Step 6: Commit** — `feat: exercise media bucket convention and ExerciseDB gifUrl passthrough`

---

### Task 7: Exercise Detail redesign — hero + cue walkthrough, YouTube gone

**Files:**
- Create: `src/components/workout/ExerciseHero.tsx`
- Modify: `src/screens/today/ExerciseDetailScreen.tsx`
- Modify: `package.json` (remove `react-native-webview` if no other importer)

- [ ] **Step 1: ExerciseHero component** — props `{ name: string; mediaUrl: string; muscles: string[]; cues: string[] }`. Behavior:
  - Renders `<Image source={{ uri: mediaUrl }}>` at height 260, `resizeMode: 'cover'`, dark frame (`Colors.surface` background, bottom border), with a bottom-up dark scrim (`LinearGradient` from transparent to `#0A0A0Acc`).
  - `onError` → swaps to the branded fallback: surface background, exercise initial in a 72px ember circle, muscle chips row, no broken-image state ever.
  - Play button (56px circle, `Ionicons play`, ember background) centered; pressing starts the walkthrough: an overlay card at the hero bottom cycling through `cues` one at a time on a 2.5s `setInterval` (cue text + "n/m" counter + pause on tap, X to dismiss). Cleanup interval on unmount. Plain `useState`/`useEffect` — reanimated not required for v1.
- [ ] **Step 2: ExerciseDetailScreen rework**
  - Delete the `WebView` import, `videoLoading` state, `videoQuery`/`embedUrl`, and the whole embedded-video block; render `<ExerciseHero name={exercise.name} mediaUrl={exercise.media_url ?? exerciseImageUrl(exercise.id)} muscles={exercise.muscles_primary} cues={[...exercise.setup_cues, ...exercise.execution_cues]} />`.
  - **Fix the edb lookup hole:** `getExerciseById` only knows the local 30. Before the not-found return, fall back to searching the workout store: `useWorkoutStore.getState().workouts.flatMap(w => w.exercises).find(we => we.exercise.id === exerciseId)?.exercise` — swapped-in ExerciseDB exercises then render with their gifUrl and instruction cues.
  - Restyle: section labels via `SectionLabel`, keep tabs/chips/CTAs as-is otherwise.
- [ ] **Step 3:** `grep -r react-native-webview src/` — if ExerciseDetailScreen was the only importer, `npm uninstall react-native-webview`.
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; manual: curated exercise shows image or fallback; swapped edb exercise shows GIF; walkthrough cycles and dismisses.
- [ ] **Step 5: Commit** — `feat: branded exercise hero with cue walkthrough, remove YouTube webview`

---

### Task 8: Workout Session redesign (the blend)

**Files:**
- Modify: `src/screens/today/WorkoutSessionScreen.tsx`

Keep all existing logic/handlers (`handleLogSet`, rest timer effect, skip/next/finish, Form Coach gate, unit toggle). This is a layout rework of the render body plus two derived values.

- [ ] **Step 1: Wire history data** at the top of the component:

```typescript
const { lastSets, bestWeights } = useHistoryStore();
const unit: WeightUnit = profile?.weight_unit ?? 'lbs';
const last = currentExercise ? lastSets[currentExercise.exercise.id] : undefined;
const lastLabel = last ? `last: ${kgToDisplay(last.weight_kg, unit)} × ${last.reps}` : null;
const best = currentExercise ? bestWeights[currentExercise.exercise.id] : undefined;
const enteredKg = displayToKg(parseFloat(weight) || 0, unit);
const prDelta = best && enteredKg > best.weight_kg ? kgToDisplay(enteredKg - best.weight_kg, unit) : 0;
```

- [ ] **Step 2: Replace the set-counter bars with set pills** — one pill per target set, horizontal row. Completed: `Colors.primary + '22'` bg, ember border, text `${kgToDisplay(setWeightKg, unit)}×${reps} ✓` (track logged set data in `completedSets` as an array of `{weightKg, reps}` per exercise instead of a count — adjust `handleLogSet` accordingly: `setCompletedSets(prev => ({ ...prev, [key]: [...(prev[key] ?? []), { weightKg: displayToKg(parseFloat(weight) || 0, unit), reps: parseInt(reps, 10) }] }))`; `completedCount` becomes `(completedSets[key] ?? []).length`). Current pill: surface bg + ember border, label `SET n`. Future: muted.
- [ ] **Step 3: The stage** — one `Card` containing WEIGHT and REPS columns separated by a 1px divider: 34px round steppers (44px hit-slop), 36px-font `TextInput` values centered, unit toggle stays above the weight column, ghost line `lastLabel` under each column in `Colors.muted` 12px (hidden when null).
- [ ] **Step 4: CTA + PR nudge** — `GradientButton title="Log Set" icon="flash"` (disabled without reps). Below it, when `prDelta > 0`: `<Text>` 12px center, ember: `🔥 {prDelta} {unit} over your best — PR pace`.
- [ ] **Step 5: Ledger** — under the stage, map completed sets of the current exercise to dim rows: `Set {i+1}  ·  {weight} {unit} × {reps}  ✓` (surface bg, 0.65 opacity, checkmark ember).
- [ ] **Step 6: Inline rest bar** — replace the rest overlay card with a slim `Card`: hourglass icon, "REST" label, mm:ss countdown in ember 16px bold, 4px progress track (`width: ${(restRemaining / restTotal) * 100}%` — store `restTotal` in state alongside `restRemaining`), and the −15s / Skip / +15s buttons in a row. Same timer logic.
- [ ] **Step 7: Header** — "View demo →" becomes `Demo ▸` with a small play icon; same `navigation.navigate('ExerciseDetail', …)`.
- [ ] **Step 8: Verify** — `npx tsc --noEmit`; manual: log sets → pills fill with real numbers, ledger grows, rest bar counts down, ghost values appear once history exists, PR line appears when exceeding best.
- [ ] **Step 9: Commit** — `feat: ember workout session — set pills, big-number stage, ghost values, PR nudge, ledger, inline rest`

---

### Task 9: Today screen redesign

**Files:**
- Modify: `src/screens/today/TodayScreen.tsx`

- [ ] **Step 1: Fetch history on mount** — `const history = useHistoryStore();` and a `useEffect` calling `history.fetchHistory(userId)` once per mount (user id from `useAuthStore().session?.user?.id`).
- [ ] **Step 2: Streak flame badge** — existing badge shows `history.currentStreak` with flame icon; label `{n} DAY STREAK`; hide (or show "START YOUR STREAK") when 0.
- [ ] **Step 3: Today's Workout card** — `SectionLabel "Today's Workout"`, workout name 22px/900, meta line (`{focus} · {estimated_duration_min} min · {exercises.length} exercises`), then the first 3 exercises as rows: 22px ember number circle + name + `{target_sets}×{target_reps}` muted, then `+{n} more` if longer, then `GradientButton title="Start Workout" icon="flash"` wired to the existing start handler.
- [ ] **Step 4: Stat tiles** — replace the hardcoded stat row (line ~242) with:

```tsx
<View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>
  <StatTile label="This week" value={`${history.thisWeekSessions}/${weekPlanned}`} sub="workouts" icon="checkmark-circle" />
  <StatTile label="Longest streak" value={String(history.longestStreak)} sub="days" icon="flame" />
  <StatTile label="Total sessions" value={String(history.totalSessions)} sub="all time" icon="stats-chart" />
</View>
```

- [ ] **Step 5: Form Coach upsell** (free users only): `Card` row — ember `scan-outline` icon in a 44px tile, title "Unlock AI Form Coach", sub "Real-time camera analysis — upgrade to Premium", chevron; onPress opens the existing `PremiumModal`.
- [ ] **Step 6: Verify** — `npx tsc --noEmit`; manual: tiles show real values (zeros on fresh account), card matches mockup structure, Start Workout works.
- [ ] **Step 7: Commit** — `feat: ember today screen — streak badge, workout card, real stat tiles, form coach upsell`

---

### Task 10: Progress redesign — volume card + muscle heatmap

**Files:**
- Create: `src/components/progress/MuscleHeatmap.tsx`
- Modify: `src/screens/progress/ProgressScreen.tsx`

- [ ] **Step 1: MuscleHeatmap component** — props `{ heat: Record<string, HeatLevel> }`. Two side-by-side `react-native-svg` figures (front/back), each a stylized segmented body built from capsules (`<Rect rx>`/`<Ellipse>`), not anatomical paths:
  - Front figure regions → muscle keys: Chest, Deltoids (2 shoulder caps), Biceps (2), Core, Quadriceps (2), Calves (2).
  - Back figure regions → Traps, Lats, Triceps (2), Erectors, Glutes, Hamstrings (2), Calves (2).
  - Fill by level: high `#FF6B22`, moderate `#FF6B2288`, low `#FF6B2240`, none `Colors.surface3`. Head/hands = `Colors.surface3` always.
  - Layout each figure in a 120×260 viewBox; hardcode the capsule coordinates (head circle r14 at top, torso capsule, limb capsules) — visual polish over anatomical precision.
  - Legend row beneath: ember dot "High", half-alpha dot "Moderate", low-alpha dot "Low".
  - When `heat` is empty: render all-muted figures plus the hint text "Log workouts to light this up".
- [ ] **Step 2: Training Volume card** — at the top of ProgressScreen: `SectionLabel "Training Volume"`, big number `{total} {unit}` (sum of `volumeByWeek`, converted via `kgToDisplay`), delta line vs the prior 4 weeks (`+{pct}%` in ember when positive, muted gray otherwise — guard divide-by-zero: show delta only when the prior 4 weeks have volume), then an 8-bar chart: `volumeByWeek` as flex-row of `View`s with `height = 90 * (v / max)`, ember fill (latest bar full ember, earlier bars `Colors.primary + '99'`), week labels 10px muted beneath.
- [ ] **Step 3: Wire data + restyle** — `useHistoryStore()` for `volumeByWeek`/`muscleHeatMap` (fetch on mount like TodayScreen); insert Volume card and `SectionLabel "Muscle Groups"` + heatmap above the existing sections; restyle existing section headers to `SectionLabel`. Existing calendar/strength chart/PRs/body weight sections stay functional.
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; manual: empty history → muted figures + hint, after a logged workout → trained muscles light up and the volume bar appears.
- [ ] **Step 5: Commit** — `feat: ember progress — training volume card and muscle-group heatmap`

---

### Task 11: Store restyle + light consistency pass

**Files:**
- Modify: `src/screens/store/StoreScreen.tsx`
- Modify: `src/screens/profile/ProfileScreen.tsx`
- Modify: `src/components/ui/PremiumModal.tsx`
- Modify: `src/screens/auth/WelcomeScreen.tsx`, `src/screens/auth/LoginScreen.tsx`, `src/screens/auth/SignUpScreen.tsx` (primary buttons only)

- [ ] **Step 1: StoreScreen** — segmented control restyle (ember active pill), plan cards: `SectionLabel` headers, ember "BEST VALUE" badge on annual, `GradientButton` for subscribe CTAs, lifetime card keeps slots counter. Gear cards: icon tile + name + desc + `open-outline` icon. FAQ: scan copy for Social references and stale tab names; fix wording. No logic changes.
- [ ] **Step 2: ProfileScreen** — wire the hardcoded stat zeros (line ~318) to `useHistoryStore()`: Sessions = `totalSessions`, Streak = `currentStreak`, PRs = count of `bestWeights` entries with `at` within the last 30 days. Footer string → `RYZR v1.0.8`.
- [ ] **Step 3: PremiumModal + auth screens** — replace primary `Button`/CTA instances with `GradientButton` (same handlers); no layout changes.
- [ ] **Step 4: Verify** — `npx tsc --noEmit`; manual smoke: Store tabs render, purchase buttons still call the same handlers (don't complete a purchase), profile stats real.
- [ ] **Step 5: Commit** — `feat: ember store restyle, real profile stats, gradient CTAs across auth/premium`

---

### Task 12: Image prompts doc + CLAUDE.md update

**Files:**
- Create: `docs/exercise-image-prompts.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Prompts doc** — header explaining the workflow (generate → rename to `{id}.png` → upload to Supabase Storage bucket `exercise-media` via dashboard), a shared STYLE BLOCK, then for each of the 30 exercises in `src/constants/exercises.ts` (read the file for ids/names) one entry:

```
### {name} → upload as `{id}.png`
{STYLE BLOCK}, performing {name}: {one-line description of the key position derived from the exercise's first execution cue}
```

STYLE BLOCK: "Stylized dark 3D render of an athletic figure, matte charcoal-black body, subtle ember-orange rim lighting from the right, pure black background, dramatic studio lighting, square 1:1 crop, centered, photoreal materials, no text, no watermark".

- [ ] **Step 2: CLAUDE.md** — Design language section: accent is ember orange `#FF6B22` (delete electric-green line), add the shared components (`GradientButton`, `StatTile`, `SectionLabel`); Store products section: subscriptions + Amazon gear only (remove specialty programs); remove the social feed line from free-tier features and "Social tab" from Current state; note exercise demo media convention (`exercise-media/{id}.png`).
- [ ] **Step 3: Commit** — `docs: exercise image generation prompts and CLAUDE.md refresh`

---

### Task 13: Final verification sweep

- [ ] **Step 1:** `npx tsc --noEmit` — zero errors.
- [ ] **Step 2:** `grep -ri "youtube\|webview" src/` → nothing; `grep -ri "social" src/` → nothing functional (comments OK); `grep -r "scheduleAffirmationIfNeeded\|generateAffirmation" src/` → nothing.
- [ ] **Step 3:** Manual device pass (Expo dev build): fresh-install boots with no notification prompt → Today (tiles, streak, card) → start workout → log 2 sets (pills, ledger, rest bar, ghost/PR once history exists) → Demo hero (image + fallback) → finish workout → Progress (volume, heatmap) → Store tabs → Profile stats → forgot-password email round-trip on device.
- [ ] **Step 4:** Commit any fixes; push to origin.

---

## Release checklist (separate session, when user says ship)

1. app.json: `version: "1.0.8"`, iOS `buildNumber: "17"`, Android `versionCode: 18`.
2. User: Supabase redirect URL added; exercise images uploaded (fallbacks acceptable to ship).
3. `eas build --platform ios --profile production --non-interactive` then `eas submit --platform ios --latest --non-interactive`.
4. ASC version page: attach all 3 IAPs before Submit for Review.

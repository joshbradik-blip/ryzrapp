// workout-coach — RYZR's coach brain. Three modes:
//   chat                   — general Q&A; supports images + plan-editing tools
//   pre_workout_challenge  — auto-generated hype message before a session
//   daily_encouragement    — auto-generated morning message
//
// The client may send:
//   readiness     — compact wearable-recovery line (see src/lib/readiness.ts)
//   plan_context  — the user's workout plan (ids + names + exercises) so the
//                   model can target plan-editing tool calls
//   tools         — Anthropic tool definitions; tool calls are EXECUTED ON THE
//                   CLIENT (they mutate local plan state), this function only
//                   forwards them and returns the raw Anthropic response
//   model         — allowlisted override (haiku default; sonnet for chat/tools)
//
// Deployed from the repo: supabase/functions/workout-coach/index.ts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const ALLOWED_MODELS = ['claude-haiku-4-5-20251001', 'claude-sonnet-4-6'];

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

const APP_FEATURE_MAP = `
RYZR APP — COMPLETE FEATURE & NAVIGATION GUIDE
===============================================

BOTTOM NAVIGATION TABS (always visible):
  1. Today      — active workout, session tracking, rest timer, coach chat
  2. Progress   — training volume, heatmaps, strength charts, personal records, body comp
  3. Store      — Premium subscription, gear shop, FAQ
  4. Profile    — account settings, unit preference (kg/lbs), wearables, regenerate plan

TODAY TAB:
  - Recovery Readiness card (needs a connected wearable): 0-100 score from HRV,
    resting heart rate & sleep vs the user's own baseline
  - Home card shows today's AI-generated workout with exercise list
  - Tap "Start Workout" to enter the live session screen
  - During session: log weight + reps per set, rest timer auto-starts after each set
  - Rest timer can be skipped or adjusted ±15 seconds
  - Tap any exercise name to see the Exercise Detail screen (instructions, muscles worked)
  - Tap the swap icon to substitute an exercise with an alternative
  - Form Coach button (camera icon, Premium only): point camera at yourself during a set
    for real-time AI form feedback
  - "Ask Coach" button (Premium only): opens this AI coach chat — the coach can also
    swap or add exercises in the plan when asked
  - After finishing all sets: tap "Finish Workout" → rate how it felt → Done
  - Regenerate button: generates a brand new workout plan via AI (adapts to readiness)
  - Coming up section: scroll horizontally to see and jump to upcoming workouts

PROGRESS TAB:
  - Training volume chart and muscle-group heatmap
  - Heatmap calendar: shows every day you completed a workout
  - Strength chart: select an exercise to see weight progression over time
  - Personal Records: best lifts + wearable activity records (best step day,
    most active calories, longest sleep, lowest resting HR)
  - Body Weight + Body Composition: manual tape-measure logging or auto-synced
    from a smart scale via Apple Health / Health Connect

PROFILE TAB:
  - Edit profile: name, age, height, weight, fitness goals, injuries, equipment available
  - Wearables: connect Apple Health / Health Connect — syncs steps, heart rate,
    HRV, sleep, calories & body composition from Apple Watch, Galaxy Watch,
    Fitbit, Garmin, WHOOP, Oura, Strava, Polar and more
  - Units: switch between kg and lbs (affects all weight displays and logging)
  - Regenerate Plan: create a new AI workout plan based on updated profile
  - Sign Out: logs you out and returns to the welcome screen

STORE TAB:
  - Membership tab: upgrade to Premium (Monthly, Annual, or Founder Lifetime)
    Premium unlocks: AI Coach Chat, Form Coach, advanced charts, plan regeneration,
    AI workout generation, readiness-adaptive training
  - Gear tab: curated fitness equipment with Amazon affiliate links
  - FAQ tab: common questions and answers about RYZR features

FREE FEATURES (no subscription needed):
  - Manual workout logging (weights, reps, sets)
  - Exercise library with instructions
  - Basic streak and progress stats, readiness score display
  - Wearable connection, gear shop, FAQ
`;

function buildSystemPrompt(opts: {
  userName: string;
  workoutName: string | null;
  historyContext: string;
  mode: string;
  recentSessionCount: number;
  readiness: string | null;
  planContext: string | null;
  hasTools: boolean;
}): string {
  const { userName, workoutName, historyContext, mode, recentSessionCount, readiness, planContext, hasTools } = opts;
  const greeting = userName ? `The user's name is ${userName}.` : '';
  const workoutCtx = workoutName
    ? `Today's scheduled workout is: "${workoutName}".`
    : 'The user is not currently in an active workout session.';
  const hasHistory = recentSessionCount > 0;

  let modeInstructions = '';
  if (mode === 'pre_workout_challenge') {
    modeInstructions = `
MODE: PRE-WORKOUT CHALLENGE MESSAGE
Generate one short, energetic message (3-4 sentences max) that:
1. Acknowledges today's workout by name
2. For ANY exercise where history data is provided below, state exactly what they hit last
   time and set a specific beat-your-last target (e.g., "+2.5kg" or "+1 rep")
3. Ends with a punchy motivational line
${readiness ? 'If the readiness line below says the user is under-recovered, do NOT set beat-your-last targets — set a "match last time with perfect form" challenge instead and acknowledge the rough recovery in one clause.' : ''}
Keep it tight. No bullet points. Conversational tone.`;
  } else if (mode === 'daily_encouragement') {
    modeInstructions = `
MODE: DAILY ENCOURAGEMENT
Generate one uplifting, personal message (2-3 sentences) for the start of the user's day.
${hasHistory ? 'Reference their recent training consistency to make it feel earned.' : 'They are just getting started — make them feel welcome and capable.'}
${readiness ? 'Weave in their recovery state from the readiness line below: celebrate a primed day, or normalize going lighter on a run-down day (recovery is training too).' : ''}
Do NOT mention specific weights. Warm, coach-like tone.`;
  } else {
    modeInstructions = `
MODE: GENERAL COACH CHAT
You are the RYZR AI coach. Answer questions about workouts, exercises, nutrition, recovery,
and app features. When the user asks how to do something in the app, give them the exact
navigation steps using the APP FEATURE MAP below. Be concise — 2-4 sentences unless a
longer answer is genuinely needed. Never make up features that aren't in the map.
When shown a photo of gym equipment, identify it and explain how to use it safely.${hasTools ? `

PLAN EDITING:
You can modify the user's workout plan and profile with the provided tools (swap_exercise,
add_exercise, update_injury, update_goal, get_progress_projection). You already have the full
plan below (every workout, its exercises, and each exercise's equipment/injury data) — you
never need a photo or screenshot to see what's in a workout. Only ask for a photo when the
user is asking you to identify unfamiliar gym equipment.

Rules:
- Only use exercise names from the EXERCISE LIBRARY list — exact names, never invented ones
- Target workouts by their workout_id from THE USER'S CURRENT PLAN below
- If the request is ambiguous (which workout? which exercise to replace?), ask ONE short
  clarifying question instead of guessing
- After a tool result comes back, confirm what changed in one friendly sentence
- If the user asks for a day (e.g. "Thursday"), map it to the workout they mean using the
  plan list, and say which workout you picked

INJURY / PAIN REPORTS ("my knee hurts", "shoulder's been bothering me"):
Act immediately, don't ask for more info first. Look at today's workout (and any other
workout you're discussing) in THE USER'S CURRENT PLAN, find every exercise whose "avoid if"
list includes that body part, and call swap_exercise for each one — pick a replacement from
the library with the same category/muscle group whose "avoid if" list does NOT include that
body part. Do this for all affected exercises in one turn. ALSO call update_injury so this is
remembered for every future workout plan, not just today's — this is a separate step from
swap_exercise, do both. Then explain in one short sentence why each swap was made (e.g.
"Swapped Back Squat → Leg Press since squats load the knee — I've also noted the knee so
future plans steer clear of it too"). If nothing in today's workout conflicts with the
reported body part, still call update_injury so future plans account for it, and reassure
them that today's workout is unaffected.

VACATION / LIMITED EQUIPMENT ("I'm on vacation, bodyweight only", "just have dumbbells"):
First ask how many days this applies to (today only, or a specific number of upcoming
workouts) if they haven't said. Then, for each of those workouts (use THE USER'S CURRENT PLAN
to find the right workout_ids in order), call swap_exercise for every exercise whose
"equipment" doesn't match what's available — for "bodyweight only" that means picking
replacements marked "equipment: bodyweight". Keep the same category/muscle group per swap so
the workout still trains the same movements. Do NOT call update_goal or otherwise change their
permanent equipment/profile for a temporary trip — this is a temporary override of upcoming
workouts only. Confirm briefly once done (e.g. "Swapped Wednesday and Thursday's lifts to
bodyweight — you're covered for your trip").

GOAL CHANGES ("I want to build muscle", "help me lose fat", "training for a 10K"):
Call update_goal so future plan regenerations reflect it. This does not change today's
workout — mention that a full plan regeneration (Profile → Regenerate Plan) is how they'd see
it reflected in upcoming workouts, unless they ask you to also swap today's exercises.

FUTURE SELF / PROGRESS PROJECTIONS ("what will my bench be in a month", "will I hit my goal
by summer", "how am I trending"):
Always call get_progress_projection — NEVER estimate or invent these numbers yourself, you are
unreliable at precise numeric extrapolation. Report exactly what the tool returns, converting
units if the user writes in a different one, and add one short encouraging sentence. If the
tool says there's not enough data, say so honestly and encourage them to keep logging instead
of guessing a number.` : ''}`;
  }

  return `You are RYZR Coach, the AI fitness coach built into the RYZR workout app.
${greeting} ${workoutCtx}
${modeInstructions}

${readiness ? `WEARABLE READINESS:\n${readiness}\n` : ''}
${planContext ? `THE USER'S CURRENT PLAN + EXERCISE LIBRARY:\n${planContext}\n` : ''}
${historyContext ? `WORKOUT HISTORY CONTEXT:\n${historyContext}\n` : ''}
${APP_FEATURE_MAP}

IMPORTANT RULES:
- Always use the user's first name when you know it
- When referencing past performance, use exact numbers from the history context
- When answering navigation questions, give step-by-step tab/screen directions
- Never invent exercises, weights, or features not shown in context
- Keep responses short and action-oriented unless asked for detail
- Units: use whatever unit the user writes in; default to kg if unknown`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anthropicKey = Deno.env.get('ANTHROPIC_KEY')!;

  if (!anthropicKey) return json({ error: 'ANTHROPIC_KEY not configured' }, 500);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const serviceClient = createClient(supabaseUrl, serviceKey);

  let body: {
    // content is a string for plain text or Anthropic content blocks for
    // images / tool_use / tool_result turns — forwarded verbatim.
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
    user_name?: string;
    workout_name?: string;
    current_exercises?: string[];
    mode?: 'chat' | 'pre_workout_challenge' | 'daily_encouragement';
    readiness?: string;
    plan_context?: string;
    tools?: unknown[];
    model?: string;
    max_tokens?: number;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const mode = body.mode ?? 'chat';
  const userName = body.user_name ?? '';
  const workoutName = body.workout_name ?? null;
  const exercises = body.current_exercises ?? [];
  const readiness = typeof body.readiness === 'string' && body.readiness.trim() ? body.readiness.trim().slice(0, 600) : null;
  const planContext = typeof body.plan_context === 'string' && body.plan_context.trim() ? body.plan_context.trim().slice(0, 6000) : null;
  const tools = Array.isArray(body.tools) && body.tools.length > 0 ? body.tools : null;
  const model = ALLOWED_MODELS.includes(body.model ?? '') ? body.model! : 'claude-haiku-4-5-20251001';
  const maxTokens = Math.min(Math.max(Number(body.max_tokens) || 512, 64), 2048);

  // Fetch exercise history in parallel
  let historyLines: string[] = [];
  let recentSessionCount = 0;

  const [exerciseResults, recentResult] = await Promise.all([
    Promise.all(
      exercises.slice(0, 8).map((name) =>
        serviceClient
          .rpc('get_last_exercise_performance', {
            p_user_id: user.id,
            p_exercise_name: name,
          })
          .then(({ data }) => ({ name, data: data ?? [] }))
      )
    ),
    serviceClient.rpc('get_recent_sessions', {
      p_user_id: user.id,
      p_limit: 5,
    }),
  ]);

  // Build exercise history lines
  for (const { name, data } of exerciseResults) {
    if (data.length === 0) continue;
    const best = data.reduce(
      (mx: { weight_kg: number; reps: number }, s: { weight_kg: number; reps: number }) =>
        s.weight_kg > mx.weight_kg ? s : mx,
      data[0]
    );
    const totalReps = data.reduce((sum: number, s: { reps: number }) => sum + s.reps, 0);
    historyLines.push(
      `${name}: best set last time = ${best.weight_kg}kg × ${best.reps} reps (${data.length} sets, ${totalReps} total reps)`
    );
  }

  const recentSessions = recentResult.data ?? [];
  recentSessionCount = recentSessions.length;

  if (recentSessions.length > 0) {
    historyLines.push('');
    historyLines.push('Recent sessions:');
    for (const s of recentSessions) {
      const d = new Date(s.completed_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      historyLines.push(
        `  ${d}: ${s.workout_name} — ${s.set_count} sets, ${
          s.total_volume_kg
        }kg volume, felt ${s.felt_rating ?? '?'}/5`
      );
    }
  }

  const historyContext = historyLines.join('\n');
  const systemPrompt = buildSystemPrompt({
    userName,
    workoutName,
    historyContext,
    mode,
    recentSessionCount,
    readiness,
    planContext,
    hasTools: !!tools,
  });

  // For auto-generated modes, inject a trigger user message if messages array is empty
  let messages = body.messages;
  if (messages.length === 0) {
    if (mode === 'pre_workout_challenge') {
      messages = [{ role: 'user', content: 'Generate my pre-workout challenge message.' }];
    } else if (mode === 'daily_encouragement') {
      messages = [{ role: 'user', content: 'Give me my daily encouragement.' }];
    }
  }

  if (messages.length === 0) return json({ error: 'messages array is required for chat mode' }, 400);

  const anthropicResp = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(tools ? { tools } : {}),
    }),
  });

  const aiData = await anthropicResp.json();

  if (!anthropicResp.ok) {
    console.error('Anthropic error:', JSON.stringify(aiData));
    return json({ error: 'AI request failed', details: aiData }, 500);
  }

  return json(aiData);
});

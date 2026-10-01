import { supabase } from './supabase';
import { UserProfile, Injury, SchedulePrefs, Goal, Workout } from '../types';
import { EXERCISES } from '../constants/exercises';
import { ReadinessResult, readinessPromptContext } from './readiness';
import { conflictsWithInjuries } from './injuries';

async function callAnthropic(body: object): Promise<any> {
  console.log('[Anthropic] invoking edge function...');
  const { data, error } = await supabase.functions.invoke('anthropic-proxy', { body });
  if (error) {
    console.error('[Anthropic] edge function error:', JSON.stringify(error));
    throw new Error(`Edge function error: ${error.message}`);
  }
  if (data?.error) {
    console.error('[Anthropic] API error:', JSON.stringify(data.error));
    throw new Error(`Anthropic error: ${JSON.stringify(data.error)}`);
  }
  console.log('[Anthropic] success');
  return data;
}

async function callWorkoutCoach(body: object): Promise<any> {
  console.log('[WorkoutCoach] invoking edge function...');
  const { data, error } = await supabase.functions.invoke('workout-coach', { body });
  if (error) {
    console.error('[WorkoutCoach] edge function error:', JSON.stringify(error));
    throw new Error(`Edge function error: ${error.message}`);
  }
  if (data?.error) {
    console.error('[WorkoutCoach] API error:', JSON.stringify(data.error));
    throw new Error(`Coach error: ${JSON.stringify(data.error)}`);
  }
  console.log('[WorkoutCoach] success');
  return data;
}

interface GeneratePlanParams {
  profile: UserProfile;
  injuries: Injury[];
  disabilities: string[];
  schedule: SchedulePrefs;
  goals: Goal[];
  equipment: string[];
  /** Wearable recovery state — when present the plan adapts to it. */
  readiness?: ReadinessResult | null;
}

export async function generateWorkoutPlan(params: GeneratePlanParams): Promise<Workout[]> {
  const { profile, injuries, disabilities, schedule, goals, equipment, readiness } = params;

  const exerciseList = EXERCISES
    .filter((e) =>
      e.equipment_required.length === 0 ||
      e.equipment_required.some((eq) => equipment.includes(eq))
    )
    .filter((e) =>
      !conflictsWithInjuries(e.contraindications, injuries.map((i) => i.body_part))
    )
    .map((e) => `- "${e.name}" | ${e.category} | ${e.equipment_required.join(', ') || 'bodyweight'} | ${e.difficulty}`)
    .join('\n');

  const injuryNote = injuries.length > 0
    ? injuries.map((i) => `${i.body_part}: ${i.severity}`).join(', ')
    : 'None';

  const disabilityNote = disabilities.length > 0
    ? disabilities.join(', ')
    : 'None';

  const goalDesc = goals.map((g) => {
    const base = g.specific_activity ? `${g.category} — ${g.specific_activity}` : g.category;
    return g.target_weeks ? `${base} (target: ${g.target_weeks} weeks)` : base;
  }).join(', ');

  const systemPrompt = `You are an expert strength and conditioning coach. Generate a personalized training plan as valid JSON only — no explanation, no markdown, just JSON.`;

  const readinessCtx = readinessPromptContext(readiness ?? null);
  const readinessSection = readinessCtx
    ? `\nRECOVERY STATUS (from the user's wearable):\n${readinessCtx}\n`
    : '';
  const readinessRule = readinessCtx
    ? `\n- Apply the recovery status to WORKOUT 1 (the next session): if readiness is low, cut its volume ~20% and cap target_rpe at 7; if high, it may start assertively. Later workouts assume normal recovery.
- Mention the recovery adjustment in the affected workout's exercise notes so the user knows why.`
    : '';

  // Rough coaching heuristic: ~5 min warm-up + ~8 min per exercise (sets ×
  // work+rest + transition). This is the number the prompt below builds its
  // hard time budget from — without a concrete target, the model tends to
  // return similarly-sized sessions regardless of the requested duration.
  const targetExerciseCount = Math.max(3, Math.min(8, Math.round((schedule.minutes_per_session - 5) / 8)));

  const userPrompt = `Generate a ${schedule.days_per_week * 2}-workout (2-week) training plan.

USER PROFILE:
- Age: ${profile.age}, Sex: ${profile.sex}, Fitness: ${profile.fitness_level}
- Height: ${profile.height_cm}cm, Weight: ${profile.weight_kg}kg
- Injuries: ${injuryNote}
- Disabilities / adaptive needs: ${disabilityNote}
- Days/week: ${schedule.days_per_week}, Minutes/session: ${schedule.minutes_per_session}
- Goals: ${goalDesc}
- Equipment: ${equipment.join(', ') || 'bodyweight only'}
${readinessSection}
AVAILABLE EXERCISES:
${exerciseList}

Return exactly this JSON structure:
{
  "plan_name": string,
  "workouts": [
    {
      "id": string,
      "name": string,
      "focus": string,
      "estimated_duration_min": number,
      "week_number": number,
      "day_number": number,
      "exercises": [
        {
          "id": string,
          "exercise_id": string,
          "order": number,
          "target_sets": number,
          "target_reps": string,
          "target_rpe": number,
          "rest_seconds": number,
          "notes": string
        }
      ]
    }
  ]
}

RULES:
- Never use exercises that conflict with injuries
- For disabilities: choose exercises from the available list that CAN be performed given the condition — do NOT rename or modify the exercise name. A wheelchair user can do Push-Up, Overhead Press, Lateral Raise, Dumbbell Bicep Curl, Face Pull, Band Pull-Apart, Pallof Press, Single-Arm Dumbbell Row, Barbell Bench Press, Tricep Dip. Use these exact names.
- CRITICAL: exercise_id must be EXACTLY one of the quoted names from the available list above — copy-paste the name, do not modify it in any way. Wrong: "Seated Overhead Press". Right: "Overhead Press".
- Only use exercises from the available list
- TIME BUDGET (this is the biggest complaint users have when it's ignored — take it seriously): the user asked for ${schedule.minutes_per_session}-minute sessions. Include ${targetExerciseCount} exercises per workout as your starting point (fewer for a short session, more for a long one) and estimate each session's real time as 5 min warm-up + for each exercise (target_sets × (~45 sec work + rest_seconds)) + ~90 sec transition. Adjust exercise count, sets, and rest_seconds until that estimate lands within 5 minutes of ${schedule.minutes_per_session}. Set estimated_duration_min to your actual estimate — it must be within 5 minutes of ${schedule.minutes_per_session} for every workout. A 15-minute session and a 45-minute session for the same person should look meaningfully different — don't return the same shape of workout regardless of the time given.
- Apply progressive overload across the 2 weeks
- Match exercise difficulty, volume, and rest periods to the user's fitness level and age — beginners get beginner-difficulty exercises with more rest; experienced/advanced users get appropriately harder selections and denser sessions
- Choose exercises and rep ranges that directly serve the stated goals: hypertrophy ranges for build_muscle; higher-rep circuits for lose_fat; for specific_activity (e.g. surfing, running, climbing, a sport), don't just pick generic strength work — actively include conditioning/cardio exercises (category "cardio") AND mobility exercises (category "mobility") from the available list alongside strength work whenever the equipment and injury constraints allow it, since sport performance depends on more than raw strength${readinessRule}`;

  const data = await callAnthropic({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const raw: string = data.content?.[0]?.text ?? '';
  console.log('[generateWorkoutPlan] raw length:', raw.length, 'preview:', raw.slice(0, 200));
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in response');
  const jsonSlice = raw.slice(start, end + 1);
  let parsed: any;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch (err: any) {
    console.error('[generateWorkoutPlan] JSON.parse failed:', err.message);
    console.log('[generateWorkoutPlan] JSON tail (last 300 chars):', jsonSlice.slice(-300));
    throw err;
  }
  const workouts = mapPlanToWorkouts(parsed);
  const totalExercises = workouts.reduce((sum, w) => sum + w.exercises.length, 0);
  console.log('[generateWorkoutPlan] mapped:', workouts.length, 'workouts,', totalExercises, 'exercises');
  if (totalExercises === 0) throw new Error('Plan generated but no exercises matched our library');
  return workouts;
}

function mapPlanToWorkouts(plan: any): Workout[] {
  return (plan.workouts ?? []).map((w: any) => ({
    id: w.id ?? Math.random().toString(36).slice(2),
    name: w.name,
    focus: w.focus,
    estimated_duration_min: w.estimated_duration_min,
    week_number: w.week_number,
    day_number: w.day_number,
    exercises: (w.exercises ?? [])
      .map((e: any) => {
        const id = (e.exercise_id ?? '').toLowerCase().trim();
        const idWords = new Set(id.split(/\s+/).filter((w: string) => w.length > 2));
        const exercise =
          EXERCISES.find((ex) => ex.name.toLowerCase() === id) ??
          EXERCISES.find((ex) => ex.name.toLowerCase().includes(id)) ??
          EXERCISES.find((ex) => id.includes(ex.name.toLowerCase())) ??
          EXERCISES.map((ex) => {
            const exWords = ex.name.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
            const shared = exWords.filter((w) => idWords.has(w)).length;
            return { ex, shared };
          }).filter(({ shared }) => shared >= 2).sort((a, b) => b.shared - a.shared)[0]?.ex;
        if (!exercise) {
          console.warn('[mapPlanToWorkouts] no match for exercise_id:', e.exercise_id);
          return null;
        }
        return {
          id: e.id ?? Math.random().toString(36).slice(2),
          exercise,
          target_sets: e.target_sets,
          target_reps: e.target_reps,
          target_rpe: e.target_rpe,
          rest_seconds: e.rest_seconds,
          notes: e.notes,
          order: e.order,
        };
      })
      .filter(Boolean),
  }));
}

export interface FormAnalysis {
  score: number;
  isGoodForm: boolean;
  primaryIssue: string | null;
  cue: string;
}

// Called every N reps during live pose-detected Form Coach sessions.
// Returns a short coaching cue — no image needed.
export async function getLiveFormCue(
  exerciseName: string,
  repCount: number,
  formIssue: string | null
): Promise<string> {
  const context = formIssue
    ? `They just completed rep ${repCount} and the on-device sensor detected this form issue: "${formIssue}".`
    : `They just completed rep ${repCount} with solid form.`;
  const data = await callAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 60,
    messages: [{
      role: 'user',
      content: `You are a terse, motivating strength coach. Exercise: ${exerciseName}. ${context} Give ONE coaching cue — max 12 words, starts with an action verb, no filler. No quotes.`,
    }],
  });
  return (data.content?.[0]?.text ?? '').trim() || 'Stay tight — own every rep.';
}

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string; // local URI for display only — not sent to API
  /** 'action' = a plan change the coach just made (rendered as a status chip). */
  kind?: 'action';
}

export async function askWorkoutCoach(
  messages: CoachMessage[],
  context: { name: string; workoutName?: string; exerciseNames?: string[] }
): Promise<string> {
  const apiMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  const data = await callWorkoutCoach({
    messages: apiMessages,
    user_name: context.name,
    workout_name: context.workoutName,
    current_exercises: context.exerciseNames ?? [],
    mode: 'chat',
  });
  return data.content?.[0]?.text ?? "Let's focus — what do you need help with?";
}

export interface CoachChatTurnContext {
  name: string;
  workoutName?: string;
  exerciseNames?: string[];
  /** Compact wearable line from readinessPromptContext(). */
  readiness?: string | null;
  /** Plan + library block from buildPlanContext() — enables plan-editing tools. */
  planContext?: string | null;
  tools?: object[] | null;
}

/**
 * One raw model turn for the agentic coach chat. `apiMessages` are Anthropic
 * messages (content may be text, image blocks, tool_use, or tool_result) and
 * the FULL response is returned so the caller can run the tool-use loop.
 */
export async function coachChatTurn(apiMessages: object[], ctx: CoachChatTurnContext): Promise<any> {
  return callWorkoutCoach({
    messages: apiMessages,
    user_name: ctx.name,
    workout_name: ctx.workoutName,
    current_exercises: ctx.exerciseNames ?? [],
    mode: 'chat',
    readiness: ctx.readiness ?? undefined,
    plan_context: ctx.planContext ?? undefined,
    tools: ctx.tools ?? undefined,
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
  });
}

export async function generatePreWorkoutChallenge(
  name: string,
  workoutName: string,
  exerciseNames: string[],
  readiness?: string | null
): Promise<string> {
  const data = await callWorkoutCoach({
    messages: [],
    user_name: name,
    workout_name: workoutName,
    current_exercises: exerciseNames,
    mode: 'pre_workout_challenge',
    readiness: readiness ?? undefined,
  });
  return data.content?.[0]?.text ?? '';
}

export async function generateDailyCoachMessage(
  name: string,
  workoutName?: string,
  readiness?: string | null
): Promise<string> {
  const data = await callWorkoutCoach({
    messages: [],
    user_name: name,
    workout_name: workoutName,
    current_exercises: [],
    mode: 'daily_encouragement',
    readiness: readiness ?? undefined,
  });
  return data.content?.[0]?.text ?? '';
}

export async function generateCoachNotice(name: string, fact: string): Promise<string> {
  const data = await callWorkoutCoach({
    messages: [{ role: 'user', content: `OBSERVATION: ${fact}` }],
    user_name: name,
    mode: 'coach_notice',
  });
  return data.content?.[0]?.text ?? '';
}

export async function askCoach(
  messages: CoachMessage[],
  context: { name: string; workoutName?: string }
): Promise<string> {
  const system = `You are RYZR Coach, a knowledgeable and motivating personal trainer helping ${context.name} with their fitness journey.${context.workoutName ? ` Today they're doing: ${context.workoutName}.` : ''} Keep responses concise (2-4 sentences), direct, and practical. Be encouraging but honest. Progress, not perfection: never shame or guilt-trip a miss — a skipped workout, a stalled lift, or going over/under a calorie or macro target is neutral data and a fresh start, never a failure. Acknowledge it without judgment, note what's going well, and give one easy next step.`;
  const data = await callAnthropic({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system,
    messages,
  });
  return data.content?.[0]?.text ?? "Let's focus — what do you need help with?";
}

export async function askCoachWithImage(
  history: CoachMessage[],
  imageBase64: string,
  caption: string,
  context: { name: string; workoutName?: string }
): Promise<string> {
  const system = `You are RYZR Coach, a knowledgeable personal trainer helping ${context.name}.${context.workoutName ? ` Today they're doing: ${context.workoutName}.` : ''} When shown gym equipment or exercises in a photo, identify what it is, explain what muscle groups it targets, and give clear step-by-step instructions on how to use it safely. Keep responses practical and under 6 sentences.`;

  const recentHistory = history.slice(-6).map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const data = await callAnthropic({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system,
    messages: [
      ...recentHistory,
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: caption || 'What is this gym equipment and how do I use it properly?' },
        ],
      },
    ],
  });

  return data.content?.[0]?.text ?? "I couldn't analyze that image. Try again.";
}

export interface PoseSnapshot {
  position: 'ready' | 'mid' | 'contracted' | 'unknown';
  formIssue: string | null;
  score: number;
  visible: boolean;
}

// One frame → position state + form issue. JS-side state machine counts reps
// from position transitions (contracted → ready/mid = rep complete).
export async function analyzePoseSnapshot(
  exerciseName: string,
  imageBase64: string
): Promise<PoseSnapshot> {
  const data = await callAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 180,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          {
            type: 'text',
            text: `You are an expert strength coach watching a single still frame of a person doing "${exerciseName}".

Classify the body position decisively. Pick ONE — do NOT default to "mid" when you can reasonably tell.

position categories:
- "ready"      = top of the movement / starting position. Squat: standing or hips above parallel. Pushup: arms mostly extended. Curl: arms hanging, weight low. Hip thrust: hips on floor. Deadlift: bar on floor or just off floor. Press: arms locked overhead.
- "contracted" = bottom or peak of the movement, even if not perfect form. Squat: hips at or below knee level OR knees clearly bent past 90°. Pushup: chest within ~1 ft of floor. Curl: weight at shoulder or elbow clearly past 90°. Hip thrust: hips clearly lifted, glutes engaged. Deadlift: bar at hip lockout. Press: arms bent, weight at shoulders. Lunge: rear knee close to ground.
- "mid"        = clearly between, e.g. squat with knees at ~45° bend
- "unknown"    = person not visible / not in frame / unrelated activity

BIAS toward "ready" or "contracted" — they're what reps are counted from. Only return "mid" if the person is genuinely halfway between positions.

formIssue should be a short actionable cue (max 12 words, starts with a verb) ONLY if you actually see a clear form problem; otherwise null. Don't nitpick — only flag real issues.

Respond with ONLY valid JSON (no markdown, no commentary):
{
  "position": "<ready|mid|contracted|unknown>",
  "formIssue": <string or null>,
  "score": <integer 0-100>,
  "visible": <true|false>
}`,
          },
        ],
      },
    ],
  });

  const text: string = data.content?.[0]?.text ?? '{}';
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    const slice = start >= 0 && end > start ? text.slice(start, end + 1) : '{}';
    const parsed = JSON.parse(slice);
    const pos = parsed.position;
    return {
      position: (pos === 'ready' || pos === 'mid' || pos === 'contracted') ? pos : 'unknown',
      formIssue: typeof parsed.formIssue === 'string' && parsed.formIssue.trim().length > 0 ? parsed.formIssue.trim() : null,
      score: Math.max(0, Math.min(100, Number(parsed.score) || 75)),
      visible: parsed.visible !== false,
    };
  } catch {
    return { position: 'unknown', formIssue: null, score: 0, visible: false };
  }
}

export interface SetCoachInput {
  exerciseName: string;
  reps: number;
  averageScore: number;
  /** Cue text → how many reps it fired on. */
  topIssues: { cue: string; count: number }[];
  averageRepMs: number;
  averageEccentricMs: number;
  /** 0..1, where 1 is a full-depth rep. */
  averagePeakDepth: number;
  /** 0..1 mean pose-tracking confidence over the set. */
  trackingQuality: number;
  repScores: number[];
}

/**
 * Turn a finished set into one short piece of coaching.
 *
 * This is the replacement for per-frame image analysis. The pose pipeline has
 * already measured what the body did — depth, tempo, symmetry, which faults
 * fired and how often — so Claude gets numbers rather than a dim JPEG, and is
 * asked to do the thing it is actually good at: pick the one correction that
 * matters and say it like a coach. One call per set instead of one per frame.
 */
export async function summarizeSetForCoach(input: SetCoachInput): Promise<string> {
  const issues = input.topIssues.length > 0
    ? input.topIssues.map(i => `- "${i.cue}" (flagged on ${i.count} of ${input.reps} reps)`).join('\n')
    : '- none detected';

  const lowConfidence = input.trackingQuality < 0.5;

  const data = await callAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 220,
    messages: [
      {
        role: 'user',
        content: `You are a strength coach who just watched a set. You have measurements, not video.

Exercise: ${input.exerciseName}
Reps completed: ${input.reps}
Average form score: ${input.averageScore}/100
Per-rep scores: ${input.repScores.join(', ')}
Average depth reached: ${Math.round(input.averagePeakDepth * 100)}% of a full-range rep
Average rep time: ${(input.averageRepMs / 1000).toFixed(1)}s (lowering phase ${(input.averageEccentricMs / 1000).toFixed(1)}s)
Pose-tracking confidence: ${Math.round(input.trackingQuality * 100)}%

Faults detected:
${issues}
${lowConfidence ? '\nNOTE: tracking confidence was low, so these numbers may be unreliable. Acknowledge that briefly rather than coaching hard off them.' : ''}

Write 2-3 sentences of coaching, spoken directly to the lifter:
- Lead with the single most important correction (or genuine praise if the set was clean).
- Reference the actual numbers where they help — depth, tempo, or consistency across reps.
- End with one concrete thing to do on the next set.
- No markdown, no lists, no preamble. Just the coaching.`,
      },
    ],
  });

  return data.content?.[0]?.text?.trim()
    ?? 'Solid work. Keep your tempo controlled on the next set.';
}

export async function analyzeFormFromImage(
  exerciseName: string,
  imageBase64: string,
  repCount: number
): Promise<FormAnalysis> {
  const data = await callAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          {
            type: 'text',
            text: `You are an expert strength coach analyzing form in real time.
Exercise: "${exerciseName}" — rep ${repCount}.
Analyze this image and return ONLY valid JSON, no explanation or markdown:
{
  "score": <integer 0-100 representing form quality>,
  "isGoodForm": <true if score >= 80>,
  "primaryIssue": <one short sentence describing the main fault, or null if form is solid>,
  "cue": <one actionable coaching directive, maximum 12 words, starting with an action verb>
}`,
          },
        ],
      },
    ],
  });

  const text: string = data.content?.[0]?.text ?? '{}';
  try {
    const parsed = JSON.parse(text);
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 75)),
      isGoodForm: Boolean(parsed.isGoodForm),
      primaryIssue: parsed.primaryIssue ?? null,
      cue: parsed.cue ?? 'Keep going — good effort.',
    };
  } catch {
    return { score: 75, isGoodForm: true, primaryIssue: null, cue: 'Keep going — good effort.' };
  }
}

// AI weekly recap (premium) — one short narrative over the trailing 7 days.
export async function generateWeeklyRecap(name: string, statsBlock: string): Promise<string> {
  const data = await callAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `You are RYZR Coach writing ${name}'s weekly training recap.

THIS WEEK'S DATA:
${statsBlock}

Write 3-4 warm, specific sentences: celebrate what the data shows (use the actual numbers), call out one pattern worth noticing (good or fixable), and end with exactly one line starting "Focus for next week:" with one concrete, actionable focus. No bullet points, no headers, no preamble.

Progress, not perfection: if this week fell short of their usual or their goal — fewer sessions, a missed target, a dip — treat it as neutral data, never a failure. Never scold, guilt-trip, or express disappointment; find the genuine win however small, and keep the focus line encouraging and doable. The goal is that they feel glad to come back next week.`,
    }],
  });
  return (data.content?.[0]?.text ?? '').trim();
}

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
  ctx: { name: string; unit: 'kg' | 'lbs'; readiness?: ReadinessResult | null },
): Promise<Record<string, string>> {
  if (inputs.length === 0) return {};

  const readinessCtx = readinessPromptContext(ctx.readiness ?? null);
  const readinessNote = readinessCtx ? `\nRECOVERY STATUS: ${readinessCtx}\n` : '';

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
- respects the recovery status below if present — under-recovered means NO new-weight or PR challenges
${readinessNote}
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

export interface ParsedFoodItem {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  /** Estimated portion weight. Present on photo estimates; editing it rescales the macros. */
  grams?: number;
  /** Per-100g reference values the totals were derived from (photo estimates only). */
  per100?: { calories: number; protein_g: number; carbs_g: number; fat_g: number };
  confidence?: 'high' | 'medium' | 'low';
  /** Where the per-100g values came from: a USDA FoodData Central match, or the model's own recall. */
  source?: 'usda' | 'model';
  /** The USDA food description we matched (when source is 'usda'). */
  matchedAs?: string;
}

/**
 * Parses a free-text meal description ("2 eggs and toast, black coffee")
 * into individual food items with estimated calories + macros. Runs on
 * Haiku for speed/cost. The estimate is deliberately surfaced to the user as
 * an editable draft — never saved silently — so portion guesses can be
 * corrected before they hit the log.
 */
export async function parseNutritionText(input: string): Promise<ParsedFoodItem[]> {
  const text = input.trim();
  if (!text) return [];

  const data = await callAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `You estimate nutrition from a free-text meal description. Break the text into individual food and drink items and estimate the calories and macros for the portion described. If a quantity isn't given, assume one typical serving. Use realistic common-food values. Combine obvious duplicates. Ignore anything that isn't food or drink.

Meal description: "${text}"

Respond with ONLY valid JSON, no markdown or commentary:
{"items":[{"name":"<short food name>","calories":<integer kcal>,"protein_g":<number>,"carbs_g":<number>,"fat_g":<number>}]}
If there is no food or drink, return {"items":[]}.`,
      },
    ],
  });

  return coerceFoodItems(data.content?.[0]?.text ?? '{}');
}

const PHOTO_NUTRITION_PROMPT = `You estimate nutrition from a photo of a meal. Work in steps so results are consistent: identify each food, estimate its WEIGHT, and name it the way the USDA FoodData Central database would. The app looks the food up in USDA data and computes totals — do NOT multiply anything yourself.

Rules:
- One entry per distinct food or drink. Ignore plates, cutlery, packaging and background.
- Estimate grams of the food as served. Use scale cues: a standard dinner plate is ~26 cm (10 in), a fork ~19 cm, a fist ~1 cup (~240 ml), a palm of cooked meat ~100 g, a thumb ~15 g of fat/sauce. Round grams to the nearest 5.
- search_query: a short generic USDA-style name WITHOUT brands or adjectives like "delicious" — e.g. "chicken breast roasted", "white rice", "broccoli", "spaghetti with meat sauce". Include the cooking method when it matters.
- state: "cooked" for cooked/baked/fried food, "raw" only for raw food (salad greens, fruit, raw veg), "prepared" for mixed dishes or drinks.
- Cooking fat: restaurant, fried or sauced food carries added oil or butter; plain home-steamed or grilled food usually does not. When the food is clearly oily or buttery, add the oil/butter as its OWN item (e.g. "olive oil", ~10 g) rather than hiding it in another food.
- per100g: your best recall of standard per-100g values for the food as served. This is only a fallback if the USDA lookup finds nothing, so be realistic and consistent.
- confidence: "high" if the item and portion are clear, "medium" if the portion is hard to judge, "low" if the item is ambiguous or partly hidden.

Respond with ONLY valid JSON, no markdown or commentary:
{"items":[{"name":"<short food name for the user>","search_query":"<USDA-style name>","state":"cooked|raw|prepared","grams":<number>,"per100g":{"calories":<number>,"protein_g":<number>,"carbs_g":<number>,"fat_g":<number>},"confidence":"high|medium|low"}]}
If no food or drink is visible, return {"items":[]}.`;

/**
 * Estimates nutrition from a photo of a meal via vision. The model only
 * identifies foods and estimates portion weight; per-100g values come from
 * USDA FoodData Central (usda-lookup edge function, cached so a given food
 * always resolves identically), falling back to the model's own recall when
 * there is no good match or the lookup is unavailable. Calories and macros
 * are computed in code, which removes the model's weakest step (pixels → kcal)
 * and makes repeat photos of the same meal agree far more closely. Premium
 * users get Sonnet (better portion reasoning); anyone else falls back to
 * Haiku. temperature 0 so the same image gives the same answer.
 *
 * A photo still can't see oil, hidden sugar, or true grams, so the caller
 * must present the result as an editable draft, never a final number.
 */
export async function parseNutritionPhoto(
  imageBase64: string,
  opts: { premium?: boolean } = {}
): Promise<ParsedFoodItem[]> {
  if (!imageBase64) return [];

  const data = await callAnthropic({
    model: opts.premium ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001',
    max_tokens: 900,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
          { type: 'text', text: PHOTO_NUTRITION_PROMPT },
        ],
      },
    ],
  });

  const drafts = coercePhotoItems(data.content?.[0]?.text ?? '{}');
  return applyUsdaMatches(drafts, await lookupUsda(drafts));
}

/** Server limits are 3s cache / 6s USDA / 8s per item; this is just above that. */
const USDA_LOOKUP_TIMEOUT_MS = 10000;

interface UsdaLookupResult {
  query: string;
  match: null | {
    fdcId: number;
    description: string;
    dataType: string;
    per100: NonNullable<ParsedFoodItem['per100']>;
  };
}

/**
 * Looks each draft item up in USDA FoodData Central via the usda-lookup edge
 * function. Never throws: any failure (not configured, network, rate limit)
 * returns no matches so the model's own per-100g values are used instead.
 */
async function lookupUsda(drafts: PhotoDraft[]): Promise<(UsdaLookupResult | null)[]> {
  if (drafts.length === 0) return [];
  try {
    // Never let a slow lookup stall the review sheet: after the limit we use
    // the model's own per-100g values instead.
    const { data, error } = await Promise.race([
      supabase.functions.invoke('usda-lookup', {
        body: { items: drafts.map((d) => ({ query: d.query, state: d.state })) },
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`timed out after ${USDA_LOOKUP_TIMEOUT_MS}ms`)), USDA_LOOKUP_TIMEOUT_MS)
      ),
    ]);
    if (error || !Array.isArray(data?.results)) {
      console.warn('[USDA] lookup unavailable, using model estimates');
      return [];
    }
    return data.results as UsdaLookupResult[];
  } catch (e) {
    console.warn('[USDA] lookup failed, using model estimates:', e instanceof Error ? e.message : e);
    return [];
  }
}

/** Replaces model per-100g values with USDA ones where a match exists. Pure. */
export function applyUsdaMatches(
  drafts: PhotoDraft[],
  results: (UsdaLookupResult | null)[]
): ParsedFoodItem[] {
  return drafts.map((d, i) => {
    const match = results[i]?.match;
    if (!match) return { ...d.item, source: 'model' as const };
    return {
      ...d.item,
      per100: match.per100,
      source: 'usda' as const,
      matchedAs: match.description,
      ...scaleFromPer100(match.per100, d.item.grams ?? 0),
    };
  });
}

/** Scales per-100g reference values to a portion weight. Pure — also used by the review sheet. */
export function scaleFromPer100(
  per100: NonNullable<ParsedFoodItem['per100']>,
  grams: number
): Pick<ParsedFoodItem, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'> {
  const f = Math.max(0, grams) / 100;
  const r1 = (n: number) => Math.round(n * f * 10) / 10;
  return {
    calories: Math.round(per100.calories * f),
    protein_g: r1(per100.protein_g),
    carbs_g: r1(per100.carbs_g),
    fat_g: r1(per100.fat_g),
  };
}

/** A parsed photo item plus the query/state the USDA lookup needs. */
export interface PhotoDraft {
  item: ParsedFoodItem;
  query: string;
  state: 'cooked' | 'raw' | 'prepared';
}

export function coercePhotoItems(raw: string): PhotoDraft[] {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : '{}');
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const num = (n: unknown) => Math.max(0, Number(n) || 0);
    const out: PhotoDraft[] = [];
    for (const it of items.slice(0, 20) as Record<string, any>[]) {
      if (typeof it?.name !== 'string' || !it.name.trim()) continue;
      const grams = Math.min(3000, Math.round(num(it.grams)));
      const p = it.per100g ?? {};
      const protein = num(p.protein_g);
      const carbs = num(p.carbs_g);
      const fat = num(p.fat_g);
      // Reconcile per-100g calories with the macros (Atwater 4/4/9). If the
      // model's kcal figure disagrees by >20%, trust the macros — they are
      // the more consistently recalled values. Alcohol (7 kcal/g) isn't in
      // the macros, so alcoholic drinks keep the model's figure.
      const macroKcal = protein * 4 + carbs * 4 + fat * 9;
      let kcal = num(p.calories);
      const alcoholic = /\b(wine|beer|lager|ale|vodka|whisk(?:e)?y|rum|gin|tequila|liquor|cocktail|margarita|sake|champagne|spirits?)\b/i.test(it.name);
      if (!alcoholic && macroKcal > 0 && (kcal === 0 || Math.abs(kcal - macroKcal) / macroKcal > 0.2)) kcal = macroKcal;
      if (grams <= 0 || kcal <= 0) continue;
      const per100 = { calories: kcal, protein_g: protein, carbs_g: carbs, fat_g: fat };
      const name = it.name.trim().slice(0, 80);
      out.push({
        query: typeof it.search_query === 'string' && it.search_query.trim() ? it.search_query.trim() : name,
        state: it.state === 'cooked' || it.state === 'raw' ? it.state : 'prepared',
        item: {
          name,
          grams,
          per100,
          confidence: it.confidence === 'high' || it.confidence === 'low' ? it.confidence : 'medium',
          ...scaleFromPer100(per100, grams),
        },
      });
    }
    return out;
  } catch {
    return [];
  }
}

/** Shared parse/validate for the {items:[...]} food JSON both paths return. */
function coerceFoodItems(raw: string): ParsedFoodItem[] {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const parsed = JSON.parse(start >= 0 && end > start ? raw.slice(start, end + 1) : '{}');
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const clean = (n: unknown) => Math.max(0, Math.round((Number(n) || 0) * 10) / 10);
    return items
      .filter((it: Record<string, unknown>) => typeof it?.name === 'string' && (it.name as string).trim())
      .slice(0, 20)
      .map((it: Record<string, unknown>) => ({
        name: (it.name as string).trim().slice(0, 80),
        calories: Math.max(0, Math.round(Number(it.calories) || 0)),
        protein_g: clean(it.protein_g),
        carbs_g: clean(it.carbs_g),
        fat_g: clean(it.fat_g),
      }));
  } catch {
    return [];
  }
}

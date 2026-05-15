import { supabase } from './supabase';
import { UserProfile, Injury, SchedulePrefs, Goal, Workout } from '../types';
import { EXERCISES } from '../constants/exercises';

async function callAnthropic(body: object): Promise<any> {
  const { data, error } = await supabase.functions.invoke('anthropic-proxy', { body });
  if (error) throw new Error(`Edge function error: ${error.message}`);
  if (data?.error) throw new Error(`Anthropic error: ${data.error}`);
  return data;
}

interface GeneratePlanParams {
  profile: UserProfile;
  injuries: Injury[];
  disabilities: string[];
  schedule: SchedulePrefs;
  goals: Goal[];
  equipment: string[];
}

export async function generateWorkoutPlan(params: GeneratePlanParams): Promise<Workout[]> {
  const { profile, injuries, disabilities, schedule, goals, equipment } = params;

  const exerciseList = EXERCISES
    .filter((e) =>
      e.equipment_required.length === 0 ||
      e.equipment_required.some((eq) => equipment.includes(eq))
    )
    .filter((e) =>
      !e.contraindications.some((c) => injuries.some((i) => i.body_part === c))
    )
    .map((e) => `- "${e.name}" | ${e.category} | ${e.equipment_required.join(', ') || 'bodyweight'} | ${e.difficulty}`)
    .join('\n');

  const injuryNote = injuries.length > 0
    ? injuries.map((i) => `${i.body_part}: ${i.severity}`).join(', ')
    : 'None';

  const disabilityNote = disabilities.length > 0
    ? disabilities.join(', ')
    : 'None';

  const goalDesc = goals.map((g) =>
    g.specific_activity ? `${g.category} — ${g.specific_activity}` : g.category
  ).join(', ');

  const systemPrompt = `You are an expert strength and conditioning coach. Generate a personalized training plan as valid JSON only — no explanation, no markdown, just JSON.`;

  const userPrompt = `Generate a ${schedule.days_per_week * 2}-workout (2-week) training plan.

USER PROFILE:
- Age: ${profile.age}, Sex: ${profile.sex}, Fitness: ${profile.fitness_level}
- Height: ${profile.height_cm}cm, Weight: ${profile.weight_kg}kg
- Injuries: ${injuryNote}
- Disabilities / adaptive needs: ${disabilityNote}
- Days/week: ${schedule.days_per_week}, Minutes/session: ${schedule.minutes_per_session}
- Goals: ${goalDesc}
- Equipment: ${equipment.join(', ') || 'bodyweight only'}

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
- Fully adapt the plan for any listed disabilities (e.g. wheelchair users get seated/upper body only; single-arm amputees get unilateral alternatives; visually impaired users get machine-free, touch-guided exercises)
- Only use exercises from the available list
- Keep sessions within the time limit
- Apply progressive overload across the 2 weeks
- exercise_id must be the EXACT quoted name from the available list (e.g. "Back Squat", not "Back Squat (barbell)")`;

  const data = await callAnthropic({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text: string = data.content?.[0]?.text ?? '';
  const parsed = JSON.parse(text);
  return mapPlanToWorkouts(parsed);
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
        const exercise = EXERCISES.find((ex) =>
          ex.name.toLowerCase() === (e.exercise_id ?? '').toLowerCase()
        );
        if (!exercise) return null;
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

export async function generateAffirmation(
  name: string,
  workoutName?: string
): Promise<string> {
  const context = workoutName ? `Today's workout: ${workoutName}.` : 'Today is a rest day.';
  const data = await callAnthropic({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 80,
    messages: [{
      role: 'user',
      content: `Write one short motivational affirmation for ${name}. ${context} 1-2 sentences, personal, direct, energizing. Address them by name. No hashtags or emojis.`,
    }],
  });
  return data.content?.[0]?.text ?? `${name}, today is your chance to be better than yesterday. Make it count.`;
}

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  imageUri?: string; // local URI for display only — not sent to API
}

export async function askCoach(
  messages: CoachMessage[],
  context: { name: string; workoutName?: string }
): Promise<string> {
  const system = `You are RYZR Coach, a knowledgeable and motivating personal trainer helping ${context.name} with their fitness journey.${context.workoutName ? ` Today they're doing: ${context.workoutName}.` : ''} Keep responses concise (2-4 sentences), direct, and practical. Be encouraging but honest.`;
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

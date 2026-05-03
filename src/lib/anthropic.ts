import { UserProfile, Injury, SchedulePrefs, Goal, Workout } from '../types';
import { EXERCISES } from '../constants/exercises';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

// API key should be retrieved from your Supabase Edge Function — never ship it in the app bundle
const getApiKey = (): string => {
  return process.env.EXPO_PUBLIC_ANTHROPIC_KEY ?? '';
};

interface GeneratePlanParams {
  profile: UserProfile;
  injuries: Injury[];
  schedule: SchedulePrefs;
  goals: Goal[];
  equipment: string[];
}

export async function generateWorkoutPlan(params: GeneratePlanParams): Promise<Workout[]> {
  const { profile, injuries, schedule, goals, equipment } = params;

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

  const goalDesc = goals.map((g) =>
    g.specific_activity ? `${g.category} — ${g.specific_activity}` : g.category
  ).join(', ');

  const systemPrompt = `You are an expert strength and conditioning coach. Generate a personalized training plan as valid JSON only — no explanation, no markdown, just JSON.`;

  const userPrompt = `Generate a ${schedule.days_per_week * 2}-workout (2-week) training plan.

USER PROFILE:
- Age: ${profile.age}, Sex: ${profile.sex}, Fitness: ${profile.fitness_level}
- Weight: ${profile.weight_kg}kg
- Injuries: ${injuryNote}
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
- Only use exercises from the available list
- Keep sessions within the time limit
- Apply progressive overload across the 2 weeks
- exercise_id must be the EXACT quoted name from the available list (e.g. "Back Squat", not "Back Squat (barbell)")`;

  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content[0]?.text ?? '';

  try {
    const parsed = JSON.parse(text);
    return mapPlanToWorkouts(parsed);
  } catch {
    throw new Error('Failed to parse workout plan from AI response');
  }
}

function mapPlanToWorkouts(plan: any): Workout[] {
  const { EXERCISES: exList } = require('../constants/exercises');
  return (plan.workouts ?? []).map((w: any) => ({
    id: w.id ?? Math.random().toString(36).slice(2),
    name: w.name,
    focus: w.focus,
    estimated_duration_min: w.estimated_duration_min,
    week_number: w.week_number,
    day_number: w.day_number,
    exercises: (w.exercises ?? [])
      .map((e: any) => {
        const exercise = exList.find((ex: any) =>
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
  score: number;          // 0–100
  isGoodForm: boolean;
  primaryIssue: string | null;
  cue: string;            // actionable coaching cue, ≤12 words
}

export async function generateAffirmation(
  name: string,
  workoutName?: string
): Promise<string> {
  const context = workoutName ? `Today's workout: ${workoutName}.` : 'Today is a rest day.';
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 80,
      messages: [{
        role: 'user',
        content: `Write one short motivational affirmation for ${name}. ${context} 1-2 sentences, personal, direct, energizing. Address them by name. No hashtags or emojis.`,
      }],
    }),
  });
  if (!response.ok) throw new Error('Affirmation failed');
  const data = await response.json();
  return data.content[0]?.text ?? `${name}, today is your chance to be better than yesterday. Make it count.`;
}

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function askCoach(
  messages: CoachMessage[],
  context: { name: string; workoutName?: string }
): Promise<string> {
  const system = `You are RYZR Coach, a knowledgeable and motivating personal trainer helping ${context.name} with their fitness journey.${context.workoutName ? ` Today they're doing: ${context.workoutName}.` : ''} Keep responses concise (2-4 sentences), direct, and practical. Be encouraging but honest.`;
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system,
      messages,
    }),
  });
  if (!response.ok) throw new Error('Coach unavailable');
  const data = await response.json();
  return data.content[0]?.text ?? "Let's focus — what do you need help with?";
}

export async function analyzeFormFromImage(
  exerciseName: string,
  imageBase64: string,
  repCount: number
): Promise<FormAnalysis> {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
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
    }),
  });

  if (!response.ok) throw new Error(`Form analysis error: ${response.status}`);
  const data = await response.json();
  const text: string = data.content[0]?.text ?? '{}';

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

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
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
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
        status: 401,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const unit: 'kg' | 'lbs' = body.weight_unit === 'lbs' ? 'lbs' : 'kg';
    const toKg = (w: number) => (unit === 'lbs' ? w / LB_PER_KG : w);

    const sets: IncomingSet[] = Array.isArray(body.sets) ? body.sets : [];
    const totalVolumeKg = sets.reduce(
      (sum, s) => sum + (s.reps || 0) * toKg(s.weight || 0),
      0,
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
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('save-workout-session error:', message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});

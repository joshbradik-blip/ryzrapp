-- Lock down EXECUTE on SECURITY DEFINER functions flagged by the Supabase
-- security advisor (anon_security_definer_function_executable).
--
-- The five get_* functions take a p_user_id argument and never check it
-- against auth.uid(), so anyone holding the public anon key could read any
-- user's workout data through /rest/v1/rpc/... They are only called by the
-- workout-coach edge function with the service role, so the client roles do
-- not need them at all.
--
-- The trigger and cron functions never need to be callable over the API.
-- (EXECUTE is checked when a trigger is created, not when it fires, and
-- pg_cron runs as the job owner, so triggers and the hourly drip keep working.)
--
-- Functions the signed-in app calls (referrals, lifetime slots) keep
-- `authenticated` but lose `anon` and PUBLIC.
--
-- Rollback: GRANT EXECUTE ON FUNCTION <name>(<args>) TO anon, authenticated;

-- A. Server-side only.
revoke execute on function public.get_personal_records(uuid)                from public, anon, authenticated;
revoke execute on function public.get_workout_heatmap(uuid)                 from public, anon, authenticated;
revoke execute on function public.get_strength_progression(uuid, text)      from public, anon, authenticated;
revoke execute on function public.get_last_exercise_performance(uuid, text) from public, anon, authenticated;
revoke execute on function public.get_recent_sessions(uuid, integer)        from public, anon, authenticated;
revoke execute on function public.ryzr_drip_dispatch()                      from public, anon, authenticated;
revoke execute on function public.ryzr_send_welcome_email()                 from public, anon, authenticated;
revoke execute on function public.handle_new_user()                         from public, anon, authenticated;
revoke execute on function public.handle_referral_conversion()              from public, anon, authenticated;

grant execute on function public.get_personal_records(uuid)                to service_role;
grant execute on function public.get_workout_heatmap(uuid)                 to service_role;
grant execute on function public.get_strength_progression(uuid, text)      to service_role;
grant execute on function public.get_last_exercise_performance(uuid, text) to service_role;
grant execute on function public.get_recent_sessions(uuid, integer)        to service_role;

-- B. Called by the signed-in app only.
revoke execute on function public.get_referral_status()        from public, anon;
revoke execute on function public.redeem_referral_code(text)   from public, anon;
revoke execute on function public.decrement_lifetime_slots()   from public, anon;

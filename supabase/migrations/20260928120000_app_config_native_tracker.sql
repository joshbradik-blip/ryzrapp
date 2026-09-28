-- Form Coach tracker switch (see src/lib/featureFlags.ts).
--
--   form_coach_native_tracker   true  — use Apple Vision (iOS) / ML Kit (Android)
--                               false — force the older MoveNet tracker
--
-- An escape hatch: if the platform tracker misbehaves on some devices, flip
-- this to false and every install falls back on next launch or foreground.

insert into public.app_config (key, value)
values ('form_coach_native_tracker', 'true'::jsonb)
on conflict (key) do nothing;

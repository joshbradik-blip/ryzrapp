-- Remote feature switches (see src/lib/featureFlags.ts).
--
-- One row per switch. Flip `value` in the Supabase dashboard (Table Editor →
-- app_config) and every install picks it up on next launch or foreground —
-- no build, no OTA update, no App Review.
--
--   form_coach_enabled   true/false — hides every Form Coach button and every
--                        marketing mention of it when false.

create table if not exists public.app_config (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

-- Readable by everyone, including signed-out installs (the Welcome screen
-- reads it). There is deliberately NO insert/update/delete policy: only
-- service_role — the dashboard and SQL editor — can change a switch.
drop policy if exists "app_config readable by app" on public.app_config;
create policy "app_config readable by app"
  on public.app_config
  for select
  to anon, authenticated
  using (true);

insert into public.app_config (key, value)
values ('form_coach_enabled', 'true'::jsonb)
on conflict (key) do nothing;

-- Onboarding funnel instrumentation (see src/lib/funnel.ts, docs/funnel-events.md).
--
-- Records each step between first launch and first generated plan so drop-off
-- is measurable instead of guessed at.
--
-- Events start BEFORE signup, so rows are keyed by an anonymous per-install
-- device_id; user_id fills in from signup onward. Rows carrying both are what
-- link an install to an account.

create table if not exists public.funnel_events (
  id          bigint generated always as identity primary key,
  device_id   text not null,
  user_id     uuid references auth.users(id) on delete set null,
  step        text not null,
  platform    text,
  app_version text,
  props       jsonb,
  created_at  timestamptz not null default now()
);

-- Funnel queries are "count distinct devices per step over a date range".
create index if not exists funnel_events_step_created_idx
  on public.funnel_events (step, created_at desc);
create index if not exists funnel_events_device_idx
  on public.funnel_events (device_id, created_at);
create index if not exists funnel_events_user_idx
  on public.funnel_events (user_id) where user_id is not null;

alter table public.funnel_events enable row level security;

-- Write-only from the app. Intro/signup steps happen before there is a session,
-- so anon must be able to insert.
--
-- There is deliberately NO select/update/delete policy: with RLS on, that means
-- no client can read this table back or tamper with it, while service_role (the
-- SQL editor, dashboard, and edge functions) bypasses RLS and can query freely.
-- Analytics data is therefore append-only from the client's perspective.
drop policy if exists "funnel_events insert from app" on public.funnel_events;
create policy "funnel_events insert from app"
  on public.funnel_events
  for insert
  to anon, authenticated
  with check (
    -- A client may only write rows anonymously or as itself; it can never
    -- attribute an event to another user.
    user_id is null or user_id = auth.uid()
  );

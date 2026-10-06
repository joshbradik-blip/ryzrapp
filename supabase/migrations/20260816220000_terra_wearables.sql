-- Terra wearable integration (see docs/terra-integration.md).
--
-- Replaces the direct Health Connect read path on Android. Terra talks to
-- Samsung Health's SDK directly, which surfaces resting HR and sleep that
-- Health Connect was not providing, and removes the app-priority/duplicate-source
-- problems that made step counts wrong.
--
-- Mapped daily metrics still land in the existing `health_daily_metrics` table,
-- so Progress/Today/readiness keep reading exactly what they read today. Only
-- the writer changes.

-- Which Terra user corresponds to which RYZR account, and what they connected.
create table if not exists public.terra_connections (
  user_id        uuid not null references auth.users(id) on delete cascade,
  terra_user_id  text not null,
  provider       text not null,           -- SAMSUNG, GOOGLE, APPLE_HEALTH, FITBIT, ...
  active         boolean not null default true,
  connected_at   timestamptz not null default now(),
  last_webhook_at timestamptz,
  primary key (user_id, terra_user_id)
);

create index if not exists terra_connections_terra_user_idx
  on public.terra_connections (terra_user_id) where active;

alter table public.terra_connections enable row level security;

-- Users may read their own connections (the Wearables screen lists them) and
-- deactivate them. Inserts come from the edge function via service_role, which
-- bypasses RLS — the client never writes the terra_user_id mapping itself.
drop policy if exists "terra_connections read own" on public.terra_connections;
create policy "terra_connections read own"
  on public.terra_connections for select
  to authenticated using (user_id = auth.uid());

drop policy if exists "terra_connections update own" on public.terra_connections;
create policy "terra_connections update own"
  on public.terra_connections for update
  to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Raw webhook envelopes, stored BEFORE any parsing.
--
-- Terra allows 8 seconds to respond and drops an event after ~8h of failed
-- retries with no notification, so the endpoint must accept and return 200
-- immediately, then map asynchronously. Keeping the raw payload means a wrong
-- field mapping is a re-parse rather than permanently lost data — which matters
-- because the exact payload schema is still being confirmed.
create table if not exists public.terra_events_raw (
  id              bigint generated always as identity primary key,
  terra_user_id   text,
  user_id         uuid references auth.users(id) on delete set null,
  event_type      text,                   -- daily | sleep | activity | body | auth | deauth ...
  payload         jsonb not null,
  signature_valid boolean not null default false,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  process_error   text
);

create index if not exists terra_events_raw_unprocessed_idx
  on public.terra_events_raw (received_at) where processed_at is null;
create index if not exists terra_events_raw_user_idx
  on public.terra_events_raw (terra_user_id, received_at desc);

alter table public.terra_events_raw enable row level security;
-- No policies: service_role only. Raw payloads are never client-readable.

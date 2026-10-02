-- Website funnel instrumentation (see web/tracking/ryzr-web.js, docs/funnel-events.md).
--
-- Records the ad-click -> landing -> CTA -> store-click path on myryzr.com so
-- Meta ad traffic can be measured before it reaches the app. Rows are keyed by
-- an anonymous per-browser session_id; there is no user identity on the web.
--
-- Same posture as funnel_events: write-only from the browser. No select/update/
-- delete policy exists, so the public anon key can append rows but never read
-- them back. service_role (SQL editor, dashboards) bypasses RLS.

create table if not exists public.web_events (
  id           bigint generated always as identity primary key,
  session_id   text not null check (char_length(session_id) between 8 and 64),
  step         text not null check (step in ('landing_view', 'cta_click', 'store_click')),
  utm_source   text check (char_length(utm_source) <= 100),
  utm_medium   text check (char_length(utm_medium) <= 100),
  utm_campaign text check (char_length(utm_campaign) <= 200),
  utm_content  text check (char_length(utm_content) <= 200),
  utm_term     text check (char_length(utm_term) <= 200),
  fbclid       text check (char_length(fbclid) <= 300),
  referrer     text check (char_length(referrer) <= 300),
  path         text check (char_length(path) <= 200),
  platform     text check (platform in ('ios', 'android', 'other')),
  cta          text check (char_length(cta) <= 100),
  created_at   timestamptz not null default now()
);

create index if not exists web_events_step_created_idx
  on public.web_events (step, created_at desc);
create index if not exists web_events_session_idx
  on public.web_events (session_id, created_at);
create index if not exists web_events_campaign_idx
  on public.web_events (utm_campaign, created_at desc) where utm_campaign is not null;

alter table public.web_events enable row level security;

drop policy if exists "web_events insert from browser" on public.web_events;
create policy "web_events insert from browser"
  on public.web_events
  for insert
  to anon
  with check (true);

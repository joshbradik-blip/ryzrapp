# Onboarding funnel events

Measures where people fall out between installing RYZR and actually training.

- Emitter: `src/lib/funnel.ts` (`logFunnelStep` / `useFunnelStep`)
- Storage: Supabase `public.funnel_events` (migration `20260816200000_funnel_events.sql`)
- Also mirrored to Meta app events as `ryzr_<step>`, so ad campaigns can optimize
  toward people who activate rather than merely install.

## The steps, in order

| Step | Fires when |
|---|---|
| `intro_viewed` | Intro carousel opens (first launch) |
| `intro_skipped` / `intro_completed` | Intro dismissed — `props.slide` is the slide they were on |
| `auth_welcome_viewed` | Welcome screen |
| `signup_viewed` | Sign-up form opened |
| `signup_submitted` | Tapped Sign Up with a valid form |
| `signup_completed` | Account actually created |
| `login_completed` | Existing user signed in |
| `social_signin_started` | Tapped Continue with Apple/Google — `props.provider`, `props.context` |
| `social_signin_completed` | Provider sign-in produced a Supabase session — same props |
| `onboarding_basics_viewed` | Profile basics |
| `onboarding_injuries_viewed` | Injuries |
| `onboarding_schedule_viewed` | Schedule |
| `onboarding_equipment_viewed` | Equipment |
| `onboarding_goals_viewed` | Goals |
| `paywall_viewed` | Choose-plan screen |
| `paywall_start_free` | Chose the free tier |
| `paywall_purchased` | Subscribed — `props.plan` is monthly/annual/lifetime |
| `paywall_restored` | Restored an existing subscription |
| `paywall_skipped_already_premium` | Skipped automatically (existing subscriber / comped) |
| `plan_generation_started` | Generation screen opened |
| `plan_ready` | Plan generated — `props.workouts` is the count |
| `plan_generation_failed` | Generation errored (**not** deduped — every failure is recorded) |
| `activated_home_viewed` | Reached the Today tab — end of funnel |

## Identity

Events start before signup, so every row carries an anonymous per-install
`device_id` (SecureStore). From signup onward rows carry `user_id` too; rows with
both are what link an install to an account.

Each step is sent **once per app launch** to stop screen re-mounts inflating
counts. `plan_generation_failed` is exempt — repeated failures are the signal.

## Reading it

Run these in the Supabase SQL editor (service role bypasses RLS; the table is
deliberately write-only for clients).

**The funnel, last 30 days, by unique install:**

```sql
with ordered(step, position) as (values
  ('intro_viewed', 1), ('auth_welcome_viewed', 2), ('signup_viewed', 3),
  ('signup_submitted', 4), ('signup_completed', 5),
  ('onboarding_basics_viewed', 6), ('onboarding_injuries_viewed', 7),
  ('onboarding_schedule_viewed', 8), ('onboarding_equipment_viewed', 9),
  ('onboarding_goals_viewed', 10), ('paywall_viewed', 11),
  ('plan_generation_started', 12), ('plan_ready', 13),
  ('activated_home_viewed', 14)
)
select
  o.position,
  o.step,
  count(distinct f.device_id) as devices,
  round(100.0 * count(distinct f.device_id)
        / nullif(max(count(distinct f.device_id)) over (), 0), 1) as pct_of_top,
  round(100.0 * count(distinct f.device_id)
        / nullif(lag(count(distinct f.device_id)) over (order by o.position), 0), 1) as pct_of_previous
from ordered o
left join public.funnel_events f
  on f.step = o.step
 and f.created_at > now() - interval '30 days'
group by o.position, o.step
order by o.position;
```

`pct_of_previous` is the column to read: the biggest drop between two adjacent
rows is where to spend effort.

**Paywall outcomes:**

```sql
select step, props->>'plan' as plan, count(distinct device_id) as devices
from public.funnel_events
where step like 'paywall%' and created_at > now() - interval '30 days'
group by 1, 2
order by devices desc;
```

**Which intro slide loses people:**

```sql
select props->>'slide' as slide_index, count(*) as skips
from public.funnel_events
where step = 'intro_skipped' and created_at > now() - interval '30 days'
group by 1 order by 1;
```

**Is plan generation failing anyone?**

```sql
select date_trunc('day', created_at) as day,
       count(*) filter (where step = 'plan_ready')             as succeeded,
       count(*) filter (where step = 'plan_generation_failed') as failed
from public.funnel_events
where created_at > now() - interval '30 days'
group by 1 order by 1 desc;
```

## Before trusting the numbers

Give it a few days of real traffic. Also note the funnel only counts installs
that reach `intro_viewed` — store-listing visitors who never install aren't here;
that data lives in Play Console / App Store Connect.

## Adding a step

Add it to the `FunnelStep` union in `src/lib/funnel.ts`, call
`useFunnelStep('...')` (mount) or `logFunnelStep('...')` (action), then add it to
the table above and to the `ordered` list in the query. No migration needed —
`step` is free-form text.

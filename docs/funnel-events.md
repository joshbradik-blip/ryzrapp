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
| `plan_choice_viewed` | Plan-choice screen (Full Gym / Bodyweight / Custom Workout) |
| `plan_choice_selected` | Tapped one of the three — `props.choice` is `full_gym` / `bodyweight` / `custom` |
| `static_plan_ready_viewed` | **Free path.** Plan-ready screen — `props.choice` is the plan they got |
| `static_plan_started` | **Free path.** Tapped Start training — same props. End of the free funnel |
| `paywall_viewed` | `PremiumModal` opened — `props.source` is the trigger that raised it |
| `paywall_purchased` | Subscribed — `props.plan` is monthly/annual/lifetime, plus `props.source` |
| `trial_started` | The purchased package carried a free trial — `props.plan`, `props.days`, `props.unit` |
| `paywall_restored` | Restored an existing subscription — `props.source` |
| `onboarding_basics_viewed` | **Premium path.** Profile basics — only reached after paying |
| `onboarding_injuries_viewed` | Injuries |
| `onboarding_schedule_viewed` | Schedule |
| `onboarding_equipment_viewed` | Equipment |
| `onboarding_goals_viewed` | Goals |
| `paywall_skipped_already_premium` | `ChoosePlanScreen` auto-skipped for an existing subscriber |
| `plan_generation_started` | Generation screen opened |
| `plan_ready` | Plan generated — `props.workouts` is the count |
| `plan_generation_failed` | Generation errored (**not** deduped — every failure is recorded) |
| `activated_home_viewed` | Reached the Today tab — end of funnel |

## The two paths

Onboarding forks at `plan_choice_selected`, and the two branches answer
different questions. Don't read them as one sequence.

**Free path** — `full_gym` or `bodyweight`. A hand-authored plan loads
instantly, no questionnaire and no AI:

```
plan_choice_selected → static_plan_ready_viewed → static_plan_started → activated_home_viewed
```

**Premium path** — `custom`. The plan-choice card raises `PremiumModal`, and
only a paying user continues into the questionnaire:

```
plan_choice_selected → paywall_viewed → paywall_purchased
  → onboarding_basics_viewed → … → onboarding_goals_viewed
  → plan_generation_started → plan_ready → activated_home_viewed
```

The conversion rate worth watching is `paywall_viewed` → `paywall_purchased`
with `props.source` = `Custom AI Workout Plans`, since that is the onboarding
paywall specifically rather than a feature gate hit later in the app.

### Steps that no longer fire during onboarding

`ChoosePlanScreen` still emits `paywall_viewed`, `paywall_start_free`, and the
`paywall_*` purchase steps, but as of the fast-path onboarding change it is
only reachable from the Profile tab's re-run flow — and an already-premium user
hitting it is auto-skipped. Treat any `paywall_start_free` as re-run traffic,
not new-user traffic.

## Identity

Events start before signup, so every row carries an anonymous per-install
`device_id` (SecureStore). From signup onward rows carry `user_id` too; rows with
both are what link an install to an account.

Each step is sent **once per app launch** to stop screen re-mounts inflating
counts. `plan_generation_failed` is exempt — repeated failures are the signal.

## Reading it

Run these in the Supabase SQL editor (service role bypasses RLS; the table is
deliberately write-only for clients).

**⚠️ The funnel branches.** `PlanChoice` splits into a fast path (Full Gym /
Bodyweight → a static plan, no questionnaire) and a Custom path (the five
questionnaire screens → AI generation). Treating those as one straight line
makes the fast path look like a mass drop-off at `onboarding_basics_viewed`
when it is in fact the intended shortcut. Read the spine first, then each
branch separately.

**1. The spine — every user passes through these, last 30 days:**

```sql
with ordered(step, position) as (values
  ('intro_viewed', 1), ('auth_welcome_viewed', 2), ('signup_viewed', 3),
  ('signup_submitted', 4), ('signup_completed', 5),
  ('plan_choice_viewed', 6), ('plan_choice_selected', 7),
  ('activated_home_viewed', 8)
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

**2. Which path people choose:**

```sql
select props->>'choice' as choice, count(distinct device_id) as devices
from public.funnel_events
where step = 'plan_choice_selected' and created_at > now() - interval '30 days'
group by 1 order by devices desc;
```

**3. The Custom sub-funnel** — denominator is people who chose `custom`, not all
installs, so this is the only fair way to judge the questionnaire:

```sql
with custom_devices as (
  select distinct device_id
  from public.funnel_events
  where step = 'plan_choice_selected'
    and props->>'choice' = 'custom'
    and created_at > now() - interval '30 days'
),
ordered(step, position) as (values
  ('onboarding_basics_viewed', 1), ('onboarding_injuries_viewed', 2),
  ('onboarding_schedule_viewed', 3), ('onboarding_equipment_viewed', 4),
  ('onboarding_goals_viewed', 5), ('plan_generation_started', 6),
  ('plan_ready', 7)
)
select
  o.position,
  o.step,
  count(distinct f.device_id) as devices,
  round(100.0 * count(distinct f.device_id)
        / nullif(lag(count(distinct f.device_id)) over (order by o.position), 0), 1) as pct_of_previous
from ordered o
left join public.funnel_events f
  on f.step = o.step
 and f.created_at > now() - interval '30 days'
 and f.device_id in (select device_id from custom_devices)
group by o.position, o.step
order by o.position;
```

**4. Social sign-in adoption vs. email:**

```sql
select
  coalesce(props->>'provider', 'email') as method,
  count(distinct device_id) as devices
from public.funnel_events
where step in ('social_signin_completed', 'signup_completed')
  and created_at > now() - interval '30 days'
group by 1 order by devices desc;
```

**Paywall outcomes:**

```sql
select step,
       props->>'source' as raised_by,   -- which gate opened it (PremiumModal tags this)
       props->>'plan'   as plan,
       count(distinct device_id) as devices
from public.funnel_events
where step like 'paywall%' and created_at > now() - interval '30 days'
group by 1, 2, 3
order by devices desc;
```

**Free trials started, and on which plan:**

```sql
select props->>'plan' as plan,
       props->>'days' as trial_days,
       props->>'unit' as unit,
       count(distinct device_id) as devices
from public.funnel_events
where step = 'trial_started' and created_at > now() - interval '30 days'
group by 1, 2, 3 order by devices desc;
```

`trial_started` fires from `purchasePackage`, so it covers every paywall surface.
The trial length is read off the store's introductory offer rather than
hardcoded, which is why `days`/`unit` are recorded per event — change the offer
in App Store Connect and old rows still say what that customer actually got.

Conversion is not measurable from `funnel_events` alone: nothing fires when a
trial converts to paid. Pair `trial_started` with RevenueCat's own charts, or
with the entitlement still being active once the trial window has elapsed.

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

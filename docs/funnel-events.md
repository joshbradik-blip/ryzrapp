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
| `premium_prompt_shown` | A free user tapped a premium feature and saw the "Premium feature" prompt — `props.source` is the feature. They may dismiss it or tap View Premium |
| `paywall_viewed` | A premium feature sent the user to Store → Membership — `props.source` is the feature (opened by `useOpenMembership`). Not fired during onboarding |
| `paywall_purchased` | Subscribed from Store → Membership — `props.plan` is monthly/annual/lifetime, `props.source` is the feature that sent them there, or `Store` if they browsed |
| `trial_started` | The purchased package carried a free trial — `props.plan`, `props.days`, `props.unit` |

Tapping a premium feature shows a small prompt (`usePremiumPrompt`); the user chooses View Premium to open Store → Membership, so `paywall_viewed` now means they chose to look. When the store has a free trial configured, the prompt and the top of Membership mention it ("Try Premium free for <duration>", wording in `src/lib/trialHeadline.ts`). Nothing is shown about a trial unless the live package has a free introductory offer.
| `paywall_restored` | Restored an existing subscription — `props.source` |
| `onboarding_basics_viewed` | **Custom path.** Profile basics |
| `onboarding_injuries_viewed` | Injuries |
| `onboarding_injuries_skipped` | Tapped Skip at the top of the Injuries screen (saves no injuries or disabilities and moves on) |
| `onboarding_schedule_viewed` | Schedule |
| `onboarding_equipment_viewed` | Equipment |
| `onboarding_goals_viewed` | Goals |
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

**Custom path** — `custom`. No paywall: the card goes straight into the
questionnaire and AI generation. Non-premium users are capped at the free 4-week
plan (`GeneratingPlanScreen`):

```
plan_choice_selected
  → onboarding_basics_viewed → … → onboarding_goals_viewed
  → plan_generation_started → plan_ready → activated_home_viewed
```

Premium is only offered when a premium feature is used. Those gates (AI Coach
Chat, Unlimited Plan Regeneration, Custom AI Workout Plans on Profile, AI Meal
Logging, Coach Voice, the Today upgrade banner) send the user to **Store →
Membership** with `props.source` set to the feature. Watch `paywall_viewed` →
`paywall_purchased` per `props.source` to see which gate converts.

### Steps that no longer fire during onboarding

`ChoosePlanScreen` has been removed. It was meant to be reachable only from the
Profile re-run flow, but the shared `GoalsScreen` still routed onboarding users
to it, so a free user who took the Custom path saw two paywalls. Goals now goes
straight to plan generation. `paywall_start_free` and
`paywall_skipped_already_premium` no longer fire; older rows of them came from
that second paywall.

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
       props->>'source' as raised_by,   -- which feature sent them to Store → Membership
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

---

# Feature adoption + retention events

Fired with `trackEvent()` in `src/lib/funnel.ts`. Same sinks as the onboarding
steps (Supabase `funnel_events` + Meta), but every event carries
`props.is_premium` so adoption can be split by plan. These events can repeat,
so they are **not** deduped per launch (except `app_opened`).

| Step | Fires when |
|---|---|
| `app_opened` | Once per app launch. Basis for retention cohorts |
| `workout_started` | A workout session screen opens (`props.workout_id`) |
| `workout_completed` | Tapped Done on the workout-complete screen (`props.sets`) |
| `ai_plan_regenerated` | A new AI plan was generated from Profile |
| `form_coach_opened` | Form Coach screen opened (once per launch) |
| `form_coach_started` | Started a Form Coach set |
| `nutrition_ai_opened` | Opened the "Snap or describe" sheet |
| `nutrition_photo_estimated` | A photo was analyzed (`props.whole_dish`, `props.items`) |
| `nutrition_logged` | Food entries saved by any path (`props.count`) |
| `coach_chat_opened` | AI coach chat sheet opened |
| `coach_chat_message_sent` | User sent a message (`props.voice`, `props.image`) |

These only exist from the app version that ships them (an OTA update on the
1.0.19 runtime). Earlier installs send none of them, so adoption and retention
numbers start from the publish date, not from launch.

## Adoption funnel (devices, last 30 days)

```sql
select
  count(distinct device_id) filter (where step = 'app_opened')               as opened,
  count(distinct device_id) filter (where step = 'workout_started')          as started_workout,
  count(distinct device_id) filter (where step = 'workout_completed')        as completed_workout,
  count(distinct device_id) filter (where step = 'nutrition_logged')         as logged_food,
  count(distinct device_id) filter (where step = 'form_coach_started')       as used_form_coach,
  count(distinct device_id) filter (where step = 'coach_chat_message_sent')  as used_coach_chat
from funnel_events
where created_at > now() - interval '30 days';
```

## Feature use by plan

```sql
select step,
       props->>'is_premium' as is_premium,
       count(*)                  as events,
       count(distinct device_id) as devices
from funnel_events
where step in ('workout_completed','nutrition_photo_estimated','form_coach_started','coach_chat_message_sent')
  and created_at > now() - interval '30 days'
group by 1, 2
order by 1, 2;
```

## Retention (day 1 / 7 / 30 return by first-open cohort)

A device "returns" on day N if it has an `app_opened` exactly N days after its
first one. Cohorts younger than N days are incomplete for that column.

```sql
with first_open as (
  select device_id, min(created_at)::date as d0
  from funnel_events
  where step = 'app_opened'
  group by 1
)
select
  f.d0                                                        as cohort,
  count(*)                                                    as devices,
  count(*) filter (where exists (select 1 from funnel_events e where e.device_id = f.device_id and e.step = 'app_opened' and e.created_at::date = f.d0 + 1))  as d1,
  count(*) filter (where exists (select 1 from funnel_events e where e.device_id = f.device_id and e.step = 'app_opened' and e.created_at::date = f.d0 + 7))  as d7,
  count(*) filter (where exists (select 1 from funnel_events e where e.device_id = f.device_id and e.step = 'app_opened' and e.created_at::date = f.d0 + 30)) as d30
from first_open f
group by 1
order by 1 desc;
```

---

# Website funnel (myryzr.com)

Tracker: `web/tracking/ryzr-web.js`. Storage: Supabase `public.web_events`
(migration `20261002000000_web_events.sql`, insert-only for the public anon key).

| Step | Fires when |
|---|---|
| `landing_view` | A page loads (once per path per browser session) |
| `cta_click` | An element marked `data-ryzr-cta="<label>"` is clicked |
| `store_click` | A link to the App Store / Google Play (or `/download`) is clicked, or `/download` hands off to a store |

`utm_*` and `fbclid` are captured on the first landing and held for the session,
so later clicks are credited to the original ad. Google Play receives the UTMs in
its `referrer` parameter via `/download`.

```sql
-- Funnel by campaign (distinct browser sessions)
select coalesce(utm_campaign, '(none)') as campaign,
       count(distinct session_id) filter (where step = 'landing_view') as landed,
       count(distinct session_id) filter (where step = 'cta_click')    as clicked_cta,
       count(distinct session_id) filter (where step = 'store_click')  as store_click
from web_events
where created_at > now() - interval '30 days'
group by 1
order by landed desc;
```

## What this can and cannot tell you

- The website funnel ends at **store click**. There is no install-attribution SDK
  (AppsFlyer, Branch, etc.), so a click cannot be joined to a specific install or
  account. Installs by campaign come from Meta Ads Manager.
- Counts undercount slightly: ad blockers and in-app browsers can drop the request.
- Everything above `store_click` is joinable by `session_id`; everything in the app
  is joinable by `device_id`. The two sets are separate.

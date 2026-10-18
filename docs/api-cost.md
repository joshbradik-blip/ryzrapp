# Reading real Claude API cost

Every Claude call writes a row to the Supabase `api_usage` table (see
`src/lib/usage.ts`). Run these in the Supabase SQL editor to see where the
money actually goes, instead of estimating from `max_tokens`.

Give it a week of real traffic before drawing conclusions — a day of your own
testing is not a sample.

## Cost per feature, last 30 days

The one query that answers "what should I gate?".

```sql
select
  feature,
  count(*)                                as calls,
  round(sum(cost_usd)::numeric, 2)        as total_usd,
  round(avg(cost_usd)::numeric, 5)        as avg_per_call,
  round(avg(input_tokens))                as avg_in,
  round(avg(output_tokens))               as avg_out
from public.api_usage
where created_at > now() - interval '30 days'
group by feature
order by total_usd desc nulls last;
```

`avg_per_call` is the number to compare against ad revenue. One US interstitial
is worth roughly **$0.01**, so any feature averaging more than that loses money
on an ad-for-access trade.

## Cost per user, to find the whales

```sql
select
  user_id,
  count(*)                         as calls,
  round(sum(cost_usd)::numeric, 2) as total_usd
from public.api_usage
where created_at > now() - interval '30 days'
group by user_id
order by total_usd desc nulls last
limit 20;
```

A handful of users at the top is normal. A single user above a few dollars a
month is a bug or an abuse path — check which feature it is before assuming
it's demand.

## Daily burn

```sql
select
  date_trunc('day', created_at)::date as day,
  round(sum(cost_usd)::numeric, 2)    as usd
from public.api_usage
group by day
order by day desc
limit 30;
```

## Is prompt caching doing anything?

```sql
select
  feature,
  sum(cache_read_tokens)  as cached_in,
  sum(input_tokens)       as uncached_in,
  round(100.0 * sum(cache_read_tokens)
        / nullif(sum(cache_read_tokens) + sum(input_tokens), 0), 1) as cache_hit_pct
from public.api_usage
where created_at > now() - interval '7 days'
group by feature
order by uncached_in desc;
```

All zeros is expected today — nothing sets `cache_control` yet. Worth
revisiting only for a feature whose cost is input-heavy; `plan_generation` is
output-heavy, so caching would barely move it.

## Unpriced models

`cost_usd` is null when the model is missing from `PRICING` in
`src/lib/usageCost.ts`. That is deliberate: an unpriced call must read as
unknown, never as free.

```sql
select model, count(*)
from public.api_usage
where cost_usd is null
group by model;
```

Any row here means update `PRICING` and re-run `npm run test:usage`.

## Caveats

- **Rates are hardcoded.** `PRICING` in `src/lib/usageCost.ts` was verified on
  2026-10-18. Published pricing changes; nothing here will fail loudly if it
  drifts.
- **Rows are written by the client**, because only the client knows which
  feature made the call — the proxy sees a model and a message array. A
  determined user could forge a row. Fine for owner-facing cost telemetry;
  move the write into the edge function before charging money off it.
- **The table is write-only to the app.** RLS lets a user insert their own rows
  and read none, so nobody can read anyone else's activity. You read it from
  the dashboard, which bypasses RLS.

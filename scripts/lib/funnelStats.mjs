// Pure aggregation for the local funnels dashboard (scripts/funnels.mjs).
// No I/O so it can be unit tested with `npm run test:funnels`.

export const APP_STEPS = [
  ['intro_viewed', 'Intro viewed'],
  ['auth_welcome_viewed', 'Welcome screen'],
  ['signup_completed', 'Signed up'],
  ['plan_choice_viewed', 'Plan choice viewed'],
  ['plan_choice_selected', 'Plan chosen'],
  ['activated_home_viewed', 'Reached Today tab'],
];

export const WEB_STEPS = [
  ['landing_view', 'Landing view'],
  ['cta_click', 'CTA click'],
  ['store_click', 'Store click'],
];

const distinct = (rows, step, key) => {
  const s = new Set();
  for (const r of rows) if (r.step === step && r[key]) s.add(r[key]);
  return s.size;
};

const funnel = (rows, steps, key) => {
  const counts = steps.map(([step, label]) => ({ step, label, count: distinct(rows, step, key) }));
  const top = counts[0]?.count || 0;
  return counts.map((c, i) => ({
    ...c,
    pctOfFirst: top ? c.count / top : 0,
    pctOfPrev: i === 0 ? 1 : counts[i - 1].count ? c.count / counts[i - 1].count : 0,
  }));
};

const tally = (rows, step, pick, key) => {
  const sets = new Map();
  for (const r of rows) {
    if (r.step !== step || !r[key]) continue;
    const k = pick(r) || 'unknown';
    if (!sets.has(k)) sets.set(k, new Set());
    sets.get(k).add(r[key]);
  }
  return [...sets].map(([name, s]) => ({ name, count: s.size })).sort((a, b) => b.count - a.count);
};

export function summarize(appRows, webRows) {
  const paywallViews = tally(appRows, 'paywall_viewed', (r) => r.props?.source, 'device_id');
  const purchases = tally(appRows, 'paywall_purchased', (r) => r.props?.plan, 'device_id');
  const campaigns = new Map();
  for (const r of webRows) {
    const c = r.utm_campaign || '(none)';
    if (!campaigns.has(c)) campaigns.set(c, { landing_view: new Set(), cta_click: new Set(), store_click: new Set() });
    campaigns.get(c)[r.step]?.add(r.session_id);
  }
  return {
    app: funnel(appRows, APP_STEPS, 'device_id'),
    web: funnel(webRows, WEB_STEPS, 'session_id'),
    planChoice: tally(appRows, 'plan_choice_selected', (r) => r.props?.choice, 'device_id'),
    paywallViews,
    purchases,
    paywall: {
      viewed: distinct(appRows, 'paywall_viewed', 'device_id'),
      purchased: distinct(appRows, 'paywall_purchased', 'device_id'),
    },
    campaigns: [...campaigns]
      .map(([name, s]) => ({ name, landing: s.landing_view.size, cta: s.cta_click.size, store: s.store_click.size }))
      .sort((a, b) => b.landing - a.landing),
    rows: { app: appRows.length, web: webRows.length },
  };
}

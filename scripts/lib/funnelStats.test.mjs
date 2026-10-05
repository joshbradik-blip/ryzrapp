import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from './funnelStats.mjs';

test('counts distinct devices per step and conversion', () => {
  const app = [
    { step: 'intro_viewed', device_id: 'a' }, { step: 'intro_viewed', device_id: 'a' },
    { step: 'intro_viewed', device_id: 'b' },
    { step: 'auth_welcome_viewed', device_id: 'a' },
    { step: 'plan_choice_selected', device_id: 'a', props: { choice: 'full_gym' } },
    { step: 'paywall_viewed', device_id: 'a', props: { source: 'AI' } },
    { step: 'paywall_purchased', device_id: 'a', props: { plan: 'lifetime' } },
  ];
  const s = summarize(app, []);
  assert.equal(s.app[0].count, 2);
  assert.equal(s.app[1].count, 1);
  assert.equal(s.app[1].pctOfPrev, 0.5);
  assert.deepEqual(s.planChoice, [{ name: 'full_gym', count: 1 }]);
  assert.deepEqual(s.paywall, { viewed: 1, purchased: 1 });
  assert.equal(s.purchases[0].name, 'lifetime');
});

test('web funnel and campaign breakdown use sessions', () => {
  const web = [
    { step: 'landing_view', session_id: 's1', utm_campaign: 'c1' },
    { step: 'landing_view', session_id: 's2' },
    { step: 'cta_click', session_id: 's1', utm_campaign: 'c1' },
    { step: 'store_click', session_id: 's1', utm_campaign: 'c1' },
  ];
  const s = summarize([], web);
  assert.deepEqual(s.web.map((w) => w.count), [2, 1, 1]);
  assert.deepEqual(s.campaigns[0], { name: 'c1', landing: 1, cta: 1, store: 1 });
  assert.equal(s.campaigns[1].name, '(none)');
});

test('empty input is safe', () => {
  const s = summarize([], []);
  assert.equal(s.app[0].pctOfFirst, 0);
  assert.equal(s.rows.app, 0);
});

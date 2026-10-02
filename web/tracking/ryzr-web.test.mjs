// Tests for the website tracker. Run with:  npm run test:web
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const src = fs.readFileSync(new URL('./ryzr-web.js', import.meta.url), 'utf8');

function load({ search = '', ua = 'Mozilla/5.0 (iPhone)', preset = {} } = {}) {
  const sent = [];
  const listeners = [];
  const storage = { ...preset };
  const window = { location: { search, pathname: '/' }, crypto: webcrypto };
  const ctx = {
    window,
    crypto: webcrypto,
    navigator: { userAgent: ua },
    document: {
      referrer: 'https://l.facebook.com/',
      currentScript: { getAttribute: (k) => ({ 'data-supabase-url': 'https://x.supabase.co', 'data-supabase-key': 'anon' }[k]) },
      addEventListener: (type, fn) => listeners.push([type, fn]),
    },
    sessionStorage: {
      getItem: (k) => (k in storage ? storage[k] : null),
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; },
    },
    fetch: (url, init) => { sent.push({ url, body: JSON.parse(init.body), headers: init.headers }); return Promise.resolve(); },
    URLSearchParams,
    Uint8Array,
    JSON,
    Object,
    decodeURIComponent,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return { sent, listeners, storage, window };
}

test('parseAttribution keeps only attribution keys and decodes values', () => {
  const { window } = load();
  assert.deepEqual(
    JSON.parse(JSON.stringify(window.RyzrWeb.parseAttribution('?utm_source=meta&utm_campaign=Spring+Sale&fbclid=abc%20d&x=1'))),
    { utm_source: 'meta', utm_campaign: 'Spring Sale', fbclid: 'abc d' },
  );
});

test('landing_view is sent once with attribution, referrer and platform', () => {
  const { sent } = load({ search: '?utm_source=meta&utm_campaign=c1&fbclid=f1' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://x.supabase.co/rest/v1/web_events');
  assert.equal(sent[0].body.step, 'landing_view');
  assert.equal(sent[0].body.utm_source, 'meta');
  assert.equal(sent[0].body.utm_campaign, 'c1');
  assert.equal(sent[0].body.fbclid, 'f1');
  assert.equal(sent[0].body.platform, 'ios');
  assert.equal(sent[0].body.referrer, 'https://l.facebook.com/');
  assert.equal(sent[0].headers.apikey, 'anon');
});

test('a reload in the same session does not double-count landing_view', () => {
  const first = load({ search: '?utm_source=meta' });
  const again = load({ preset: first.storage });
  assert.equal(again.sent.length, 0);
});

test('attribution survives to a later page with no query string', () => {
  const first = load({ search: '?utm_source=meta&utm_campaign=c1' });
  const later = load({ preset: { ...first.storage, 'ryzr_landed:/': undefined } });
  assert.equal(later.window.RyzrWeb.attribution().utm_campaign, 'c1');
});

test('does nothing without configuration', () => {
  const ctx = { window: {}, document: { currentScript: { getAttribute: () => null }, addEventListener() {} } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  assert.equal(ctx.window.RyzrWeb, undefined);
});

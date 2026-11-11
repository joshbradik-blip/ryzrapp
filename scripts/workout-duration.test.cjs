const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function handler() {
  const inserts = {};
  let serveHandler;
  const source = fs.readFileSync('supabase/functions/save-workout-session/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(compiled, {
    serve: (callback) => { serveHandler = callback; },
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'test-user' } } }) },
      from: (table) => ({ insert: (rows) => {
        inserts[table] = rows;
        return { select: () => ({ single: async () => ({ data: { id: 'session' } }) }), then: (resolve) => resolve({ error: null }) };
      } }),
    }),
    Deno: { env: { get: () => 'test' } }, Request, Response, console,
  });
  return { inserts, request: (sets) => serveHandler(new Request('https://test.invalid', {
    method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ weight_unit: 'kg', sets }),
  })) };
}

test('timed holds save duration with zero weight/reps and do not inflate volume', async () => {
  const { inserts, request } = handler();
  const response = await request([
    { exercise_name: 'Plank', set_number: 1, duration_seconds: 45, weight: 100, reps: 20 },
    { exercise_name: 'Squat', set_number: 1, weight: 50, reps: 10 },
  ]);
  assert.equal(response.status, 200);
  assert.equal(inserts.workout_sessions.total_volume_kg, 500);
  assert.equal(inserts.session_sets[0].duration_seconds, 45);
  assert.equal(inserts.session_sets[0].weight_kg, 0);
  assert.equal(inserts.session_sets[0].reps, 0);
  assert.equal(inserts.session_sets[1].duration_seconds, null);
  assert.equal(inserts.session_sets[1].reps, 10);
});

test('invalid hold durations are rejected before a session is written', async () => {
  for (const duration of [-1, 0, 86401, '45']) {
    const { inserts, request } = handler();
    assert.equal((await request([{ duration_seconds: duration }])).status, 400);
    assert.equal(Object.keys(inserts).length, 0);
  }
});

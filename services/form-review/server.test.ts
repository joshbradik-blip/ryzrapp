import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createReviewServer, type ReviewServices } from './server';

test('review endpoint gates uploads and returns the cue from the analyzer', async (t) => {
  const uploads: string[] = [];
  const services: ReviewServices = {
    authenticate: async (token) => token === 'valid' ? 'user-1' : null,
    hasPremium: async () => true,
    review: async (exerciseId, video) => {
      uploads.push(exerciseId + ':' + video.length);
      return { status: 'reviewed', cue: 'Keep the same tempo across reps.' };
    },
  };
  const server = createReviewServer(services);
  t.after(() => server.close());
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/review`;

  function post(exerciseId: string, { token = 'valid', mime = 'video/mp4' } = {}) {
    const body = new FormData();
    body.append('exerciseId', exerciseId);
    body.append('video', new Blob([Buffer.alloc(32)], { type: mime }), 'set.mp4');
    return fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  }

  assert.equal((await post('squat', { token: 'invalid' })).status, 401);
  assert.equal((await post('squat', { mime: 'image/png' })).status, 400);
  assert.equal((await post('constructor')).status, 400);
  assert.deepEqual(uploads, []);

  services.hasPremium = async () => false;
  assert.equal((await post('squat')).status, 403);
  assert.deepEqual(uploads, []);

  services.hasPremium = async () => true;
  const result = await post('squat');
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { status: 'reviewed', cue: 'Keep the same tempo across reps.' });
  assert.deepEqual(uploads, ['squat:32']);
});

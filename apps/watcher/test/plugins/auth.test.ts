import { test } from 'node:test';
import * as assert from 'node:assert';
import Fastify from 'fastify';
import Auth from '../../src/plugins/auth.js';
import { build } from '../helper.js';

test('generation routes require the shared secret when configured', async (t) => {
  process.env.WATCHER_API_KEY = 'test-watcher-key';
  t.after(() => {
    delete process.env.WATCHER_API_KEY;
  });
  const app = await build(t);

  const health = await app.inject({ url: '/' });
  assert.equal(health.statusCode, 200);

  const missing = await app.inject({
    method: 'POST',
    url: '/generate/narrative',
    payload: {},
  });
  assert.equal(missing.statusCode, 401);

  const wrong = await app.inject({
    method: 'POST',
    url: '/generate/narrative',
    headers: { authorization: 'Bearer nope' },
    payload: {},
  });
  assert.equal(wrong.statusCode, 401);

  // Authenticated requests reach the route, which rejects the empty body.
  const authorized = await app.inject({
    method: 'POST',
    url: '/generate/narrative',
    headers: { authorization: 'Bearer test-watcher-key' },
    payload: {},
  });
  assert.equal(authorized.statusCode, 400);
});

test('auth refuses to start without a key when one is required', async () => {
  const fastify = Fastify();
  void fastify.register(Auth, { apiKey: '', requireKey: true });
  await assert.rejects(async () => {
    await fastify.ready();
  }, /WATCHER_API_KEY must be set/);
});

test('auth allows requests without a key in development', async () => {
  const fastify = Fastify();
  void fastify.register(Auth, { apiKey: '', requireKey: false });
  fastify.get('/generate/x', async () => ({ ok: true }));
  const res = await fastify.inject({ url: '/generate/x' });
  assert.equal(res.statusCode, 200);
});

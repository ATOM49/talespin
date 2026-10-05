import assert from 'node:assert/strict';
import { it } from 'node:test';
import Fastify from 'fastify';
import recovery from '../../src/plugins/generation-recovery.js';
import { recoverGeneration } from '../../src/services/generation-recovery.js';
import { MemoryStore } from '../memory-generation-store.js';

it('uses shared wire schemas and keeps the generation scope across Fastify hooks', async () => {
  const app = Fastify();
  const store = new MemoryStore();
  let calls = 0;
  await app.register(recovery, { store });
  app.post('/generate/map', async (request) =>
    recoverGeneration({ body: request.body }, async () => {
      calls++;
      return { imageUrl: 'https://cdn.test/map.png' };
    }),
  );
  try {
    const input = {
      method: 'POST' as const,
      url: '/generate/map',
      headers: { 'x-generation-id': 'same-job' },
      payload: { name: 'World', theme: 'fantasy' },
    };
    assert.equal((await app.inject(input)).statusCode, 200);
    assert.equal((await app.inject(input)).statusCode, 200);
    assert.equal(calls, 1);
    assert.equal(
      (await app.inject({ ...input, payload: { name: '' } })).statusCode,
      400,
    );
    assert.equal(
      (
        await app.inject({
          ...input,
          headers: { 'x-generation-id': 'invalid/id' },
        })
      ).statusCode,
      400,
    );
  } finally {
    await app.close();
  }
});

it('rejects a successful HTTP reply whose output violates the shared contract', async () => {
  const app = Fastify();
  await app.register(recovery, { store: new MemoryStore() });
  app.post('/generate/character-gallery', async () => ({
    gallery: [],
    coverImage: 'wrong-shape',
  }));
  try {
    const reply = await app.inject({
      method: 'POST',
      url: '/generate/character-gallery',
      payload: { name: 'Hero' },
    });
    assert.equal(reply.statusCode, 502);
  } finally {
    await app.close();
  }
});

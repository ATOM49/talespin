import assert from 'node:assert/strict';
import { it } from 'node:test';
import { WatcherClient, WatcherError } from '../src/lib/api/watcher-client';

it('uses the shared gallery endpoint and validates its response', async () => {
  let sent: RequestInit | undefined;
  const client = new WatcherClient({
    baseUrl: 'http://watcher.test/',
    apiKey: 'test-key',
    fetch: async (url, init) => {
      assert.equal(url, 'http://watcher.test/generate/character-gallery');
      sent = init;
      return Response.json({
        imageUrl: 'https://cdn.test/hero.png',
        images: [{ angle: 'front', imageUrl: 'https://cdn.test/hero.png' }],
      });
    },
  });
  const result = await client.request(
    '/generate/character-gallery',
    { name: 'Hero' },
    { generationId: 'job-1' },
  );
  assert.equal(result.images.length, 1);
  assert.equal(
    (sent?.headers as Record<string, string>)['X-Generation-Id'],
    'job-1',
  );
  assert.equal(
    (sent?.headers as Record<string, string>).Authorization,
    'Bearer test-key',
  );
});

it('rejects malformed inputs before sending a request', async () => {
  let calls = 0;
  const client = new WatcherClient({
    fetch: async () => {
      calls++;
      return Response.json({});
    },
  });
  await assert.rejects(
    client.request('/generate/character-gallery', { name: '' }),
  );
  assert.equal(calls, 0);
});

it('rejects the obsolete character-gallery response shape', async () => {
  const client = new WatcherClient({
    fetch: async () => Response.json({ profile: {}, gallery: [] }),
  });
  await assert.rejects(
    client.request('/generate/character-gallery', { name: 'Hero' }),
    (error: unknown) => error instanceof WatcherError && error.status === 502,
  );
});

it('does not automatically repeat billable calls on server errors', async () => {
  let calls = 0;
  const client = new WatcherClient({
    fetch: async () => {
      calls++;
      return new Response('', { status: 503 });
    },
  });
  await assert.rejects(
    client.request('/generate/character-gallery', { name: 'Hero' }),
  );
  assert.equal(calls, 1);
});

it('keeps the timeout active while consuming a response body', async () => {
  const client = new WatcherClient({
    timeoutMs: 5,
    fetch: async (_url, init) => {
      const stream = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () =>
            controller.error(new Error('aborted')),
          );
        },
      });
      return new Response(stream);
    },
  });
  await assert.rejects(
    client.request('/generate/character-gallery', { name: 'Hero' }),
    (error: unknown) => error instanceof WatcherError && error.status === 504,
  );
});

it('preserves only the safe recovery checkpoint ID from an upstream failure', async () => {
  const step = 'a'.repeat(64);
  const client = new WatcherClient({
    fetch: async () =>
      Response.json(
        {
          error: 'Failed',
          details: `Provider submission requires reconciliation. Recovery step: ${step}`,
        },
        { status: 500 },
      ),
  });
  await assert.rejects(
    client.request('/generate/character-gallery', { name: 'Hero' }),
    (error: unknown) =>
      error instanceof WatcherError && error.message.includes(step),
  );
});

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { it } from 'node:test';
import { MongoClient } from 'mongodb';
import { MongoGenerationStore } from '../../src/services/mongo-generation-store.js';
import {
  generationContext,
  recoverGeneration,
} from '../../src/services/generation-recovery.js';

const configuredUri = process.env.RECOVERY_TEST_DATABASE_URL;
const testUrl = configuredUri ? new URL(configuredUri) : undefined;
if (testUrl)
  testUrl.pathname = `/talespin_recovery_test_${randomUUID().replaceAll('-', '')}`;
const uri = testUrl?.toString();
it(
  'persists results across store restarts and atomically fences overlapping claims',
  { skip: !uri },
  async () => {
    const store = new MongoGenerationStore(uri!);
    const second = new MongoGenerationStore(uri!);
    const scope = `integration-${randomUUID()}`;
    const id = randomUUID();
    let calls = 0;
    try {
      await Promise.all([store.ensure(id), second.ensure(id)]);
      const until = new Date(Date.now() + 10000);
      const claims = await Promise.all([
        store.claim(id, 'one', until, new Date()),
        second.claim(id, 'two', until, new Date()),
      ]);
      assert.equal(claims.filter(Boolean).length, 1);
      const winner = claims.find(Boolean)!;
      await assert.rejects(
        store.update(id, winner.owner === 'one' ? 'two' : 'one', {
          status: 'COMPLETED',
        }),
        /superseded/,
      );
      const first = await generationContext.run({ scope, store }, () =>
        recoverGeneration('text', async () => {
          calls++;
          return { content: 'durable result' };
        }),
      );
      let submissions = 0;
      await assert.rejects(
        generationContext.run({ scope, store }, () =>
          recoverGeneration('image', async (recovery) => {
            await recovery.beforeSubmit();
            submissions++;
            await recovery.onSubmitted('saved-provider-job');
            throw new Error('upload failed');
          }),
        ),
        /upload failed/,
      );
      await store.close();
      const recovered = await generationContext.run(
        { scope, store: second },
        () =>
          recoverGeneration('text', async () => {
            calls++;
            return { content: 'duplicate' };
          }),
      );
      assert.deepEqual(first, recovered);
      assert.equal(calls, 1);
      const image = await generationContext.run({ scope, store: second }, () =>
        recoverGeneration('image', async (recovery) => {
          assert.equal(recovery.requestId, 'saved-provider-job');
          return { url: 'https://cdn.test/saved.png' };
        }),
      );
      assert.equal(submissions, 1);
      assert.equal(image.url, 'https://cdn.test/saved.png');
      await second.update(id, winner.owner!, {
        status: 'UNKNOWN',
        leaseUntil: new Date(0),
      });
      await second.reconcile(id, 'reconciled-provider-job');
      assert.equal(
        (await second.get(id))?.requestId,
        'reconciled-provider-job',
      );
    } finally {
      await Promise.all([store.close(), second.close()]);
      const cleanup = new MongoClient(uri!);
      try {
        await cleanup.connect();
        await cleanup.db().dropDatabase();
      } finally {
        await cleanup.close();
      }
    }
  },
);

import { MemoryStore } from '../memory-generation-store.js';
import assert from 'node:assert/strict';
import { it } from 'node:test';
import {
  generationContext,
  generationFingerprint,
  recoverGeneration,
  type GenerationStore,
} from '../../src/services/generation-recovery.js';

const withStore = <T>(store: GenerationStore, work: () => Promise<T>) =>
  generationContext.run({ scope: 'test-generation', store }, work);

it('reuses completed text and resumes a submitted image after an upload failure', async () => {
  const store = new MemoryStore();
  let textCalls = 0;
  let submissions = 0;
  let imageAttempts = 0;
  const run = () =>
    withStore(store, async () => {
      const text = await recoverGeneration({ stage: 'text' }, async () => {
        textCalls++;
        return 'saved prompt';
      });
      return recoverGeneration({ stage: 'image', text }, async (recovery) => {
        imageAttempts++;
        if (!recovery.requestId) {
          await recovery.beforeSubmit();
          submissions++;
          await recovery.onSubmitted('segmind-success');
        } else assert.equal(recovery.requestId, 'segmind-success');
        if (imageAttempts === 1) throw new Error('CDN upload failed');
        return { url: 'https://cdn.example/image.png' };
      });
    });
  await assert.rejects(run, /CDN upload failed/);
  assert.deepEqual(await run(), { url: 'https://cdn.example/image.png' });
  await run();
  assert.equal(textCalls, 1);
  assert.equal(submissions, 1);
  assert.equal(imageAttempts, 2);
});

it('does not resubmit when the submission response was lost', async () => {
  const store = new MemoryStore();
  let submissions = 0;
  const run = () =>
    withStore(store, () =>
      recoverGeneration({ stage: 'ambiguous' }, async (recovery) => {
        await recovery.beforeSubmit();
        submissions++;
        throw new Error('Network disconnected after POST');
      }),
    );
  await assert.rejects(run, /Network disconnected/);
  await assert.rejects(run, /reconciliation/);
  assert.equal(submissions, 1);
});

it('allows replacement only after a confirmed terminal provider failure and retains history', async () => {
  const store = new MemoryStore();
  let submissions = 0;
  const run = () =>
    withStore(store, () =>
      recoverGeneration({ stage: 'terminal' }, async (recovery) => {
        await recovery.beforeSubmit();
        submissions++;
        await recovery.onSubmitted(`provider-${submissions}`);
        if (submissions === 1) {
          const error = new Error('Inference failed');
          error.name = 'SegmindInferenceError';
          throw error;
        }
        return 'replacement';
      }),
    );
  await assert.rejects(run);
  assert.equal(await run(), 'replacement');
  assert.equal(submissions, 2);
  assert.deepEqual([...store.records.values()][0].requestIds, [
    'provider-1',
    'provider-2',
  ]);
});

it('prevents concurrent requests from submitting the same stage', async () => {
  const store = new MemoryStore();
  let release!: () => void;
  let started!: () => void;
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = withStore(store, () =>
    recoverGeneration('same', async () => {
      started();
      await waiting;
      return 'done';
    }),
  );
  await begun;
  await assert.rejects(
    withStore(store, () => recoverGeneration('same', async () => 'duplicate')),
    /already running/,
  );
  release();
  assert.equal(await first, 'done');
});

it('reclaims an interrupted submitted job without replacing its provider ID', async () => {
  const store = new MemoryStore();
  const id = generationFingerprint({
    version: 1,
    scope: 'test-generation',
    identity: 'interrupted',
  });
  store.records.set(id, {
    _id: id,
    status: 'SUBMITTED',
    requestId: 'existing-id',
    owner: 'dead-process',
    leaseUntil: new Date(0),
    updatedAt: new Date(),
  });
  const result = await withStore(store, () =>
    recoverGeneration('interrupted', async (recovery) => {
      assert.equal(recovery.requestId, 'existing-id');
      return 'recovered';
    }),
  );
  assert.equal(result, 'recovered');
});

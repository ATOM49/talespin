import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drainGenerationJobs,
  generationJobRunner,
} from '../src/lib/jobs/generation-runner';

const queue = (ids: string[]) => ({
  runNextJob: async () => ids.shift() ?? null,
});

test('generationJobRunner defaults to inline only on Vercel', () => {
  assert.equal(generationJobRunner({}), 'worker');
  assert.equal(generationJobRunner({ VERCEL: '1' }), 'inline');
  assert.equal(
    generationJobRunner({ VERCEL: '1', GENERATION_JOB_RUNNER: 'worker' }),
    'worker',
  );
  assert.equal(
    generationJobRunner({ GENERATION_JOB_RUNNER: 'inline' }),
    'inline',
  );
});

test('drainGenerationJobs runs world then narrative jobs until empty', async () => {
  const world = queue(['w1']);
  const narrative = queue(['n1', 'n2']);
  const processed = await drainGenerationJobs({
    budgetMs: 60_000,
    reserveMs: 1_000,
    world,
    narrative,
  });
  assert.equal(processed, 3);
});

test('drainGenerationJobs starts only one job when another would not fit', async () => {
  const narrative = queue(['n1', 'n2', 'n3']);
  const processed = await drainGenerationJobs({
    budgetMs: 1_000,
    reserveMs: 5_000,
    world: queue([]),
    narrative,
  });
  assert.equal(processed, 1);
});

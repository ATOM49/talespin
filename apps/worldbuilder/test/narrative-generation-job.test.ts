import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { NarrativeJob } from '@talespin/schema';
import { NarrativeGenerationService } from '../src/lib/api/narrative-generation.service';

test('the narrative worker selects the oldest dispatchable job and runs it outside a route', async () => {
  let selection: Prisma.NarrativeJobFindFirstArgs | undefined;
  const fakePrisma = {
    narrativeJob: {
      findFirst: async (args: Prisma.NarrativeJobFindFirstArgs) => {
        selection = args;
        return { id: 'narrative-job-1' };
      },
    },
  } as unknown as PrismaClient;

  const service = new NarrativeGenerationService(fakePrisma);
  let executedJobId: string | undefined;
  service.runJob = async (jobId) => {
    executedJobId = jobId;
    return {} as NarrativeJob;
  };

  const processedJobId = await service.runNextJob();

  assert.equal(processedJobId, 'narrative-job-1');
  assert.equal(executedJobId, 'narrative-job-1');
  assert.deepEqual(selection?.orderBy, { createdAt: 'asc' });
  assert.ok(selection?.where?.OR);
});

test('the narrative worker stays idle when no job is dispatchable', async () => {
  const fakePrisma = {
    narrativeJob: {
      findFirst: async () => null,
    },
  } as unknown as PrismaClient;

  const service = new NarrativeGenerationService(fakePrisma);
  service.runJob = async () => {
    throw new Error('runJob must not be called without a candidate');
  };

  assert.equal(await service.runNextJob(), null);
});

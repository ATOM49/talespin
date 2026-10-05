import assert from 'node:assert/strict';
import test from 'node:test';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { WorldGenerationJob } from '@talespin/schema';
import { ApiError } from '../src/lib/api/errors';
import { WorldGenerationService } from '../src/lib/api/world-generation.service';

type JobRecord = Prisma.WorldGenerationJobGetPayload<object>;

const seed = {
  name: 'Interrupted World',
  theme: 'fantasy',
  description: 'A world whose first generation worker disappeared mid-flight.',
  regionCount: 5,
  factionCount: 3,
  charactersPerFaction: 1,
} as const;

const createJobRecord = (overrides: Partial<JobRecord> = {}): JobRecord => ({
  id: 'job-1',
  userId: 'builder-1',
  status: 'GENERATING',
  seed,
  blueprint: { context: 'saved-checkpoint' },
  resultWorldId: null,
  attempt: 2,
  error: 'The request was interrupted.',
  leaseExpiresAt: new Date(Date.now() - 60_000),
  startedAt: new Date(Date.now() - 120_000),
  finishedAt: null,
  createdAt: new Date(Date.now() - 180_000),
  updatedAt: new Date(Date.now() - 60_000),
  ...overrides,
});

test('retry requeues an interrupted attempt without discarding its blueprint', async () => {
  let record = createJobRecord();
  const updates: Array<Prisma.WorldGenerationJobUpdateManyArgs> = [];
  const fakePrisma = {
    worldGenerationJob: {
      findFirst: async (args: Prisma.WorldGenerationJobFindFirstArgs) => {
        if (args.where?.userId && args.where.userId !== record.userId) {
          return null;
        }
        return record;
      },
      updateMany: async (args: Prisma.WorldGenerationJobUpdateManyArgs) => {
        updates.push(args);
        record = {
          ...record,
          status: 'QUEUED',
          error: null,
          leaseExpiresAt: null,
          startedAt: null,
          finishedAt: null,
          updatedAt: new Date(),
        };
        return { count: 1 };
      },
    },
  } as unknown as PrismaClient;

  const service = new WorldGenerationService(fakePrisma);
  let executedInline = false;
  service.runJob = async () => {
    executedInline = true;
    return {} as WorldGenerationJob;
  };
  const job = await service.retryJob(record.id, record.userId);

  assert.equal(job.status, 'QUEUED');
  assert.equal(job.attempt, 2);
  assert.equal(job.blueprintAvailable, true);
  assert.equal(executedInline, false);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.where?.id, record.id);
  assert.equal(updates[0]?.where?.userId, record.userId);
  assert.equal(updates[0]?.data.status, 'QUEUED');
  assert.equal('blueprint' in (updates[0]?.data ?? {}), false);
});

test('retry remains scoped to the builder that owns the job', async () => {
  const record = createJobRecord();
  const fakePrisma = {
    worldGenerationJob: {
      findFirst: async (args: Prisma.WorldGenerationJobFindFirstArgs) =>
        args.where?.userId === record.userId ? record : null,
    },
  } as unknown as PrismaClient;

  const service = new WorldGenerationService(fakePrisma);
  await assert.rejects(
    service.retryJob(record.id, 'another-builder'),
    (error: unknown) => error instanceof ApiError && error.statusCode === 404,
  );
});

test('the background worker selects queued work and executes it outside the route', async () => {
  const record = createJobRecord({ status: 'QUEUED', leaseExpiresAt: null });
  let selection: Prisma.WorldGenerationJobFindFirstArgs | undefined;
  const fakePrisma = {
    worldGenerationJob: {
      findFirst: async (args: Prisma.WorldGenerationJobFindFirstArgs) => {
        selection = args;
        return { id: record.id, userId: record.userId };
      },
    },
  } as unknown as PrismaClient;

  const service = new WorldGenerationService(fakePrisma);
  let executed: { jobId: string; userId: string } | undefined;
  service.runJob = async (jobId, userId) => {
    executed = { jobId, userId };
    return {} as WorldGenerationJob;
  };

  const processedJobId = await service.runNextJob();

  assert.equal(processedJobId, record.id);
  assert.deepEqual(executed, { jobId: record.id, userId: record.userId });
  assert.deepEqual(selection?.orderBy, { createdAt: 'asc' });
});

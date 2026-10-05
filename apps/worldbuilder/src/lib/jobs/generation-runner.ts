import { after } from 'next/server';
import { NarrativeGenerationService } from '@/lib/api/narrative-generation.service';
import { WorldGenerationService } from '@/lib/api/world-generation.service';
import { prisma } from '@/lib/prisma';

/**
 * Where queued generation jobs execute:
 * - `worker`: the long-running worker processes (Docker, local `pnpm dev`).
 * - `inline`: after the HTTP response inside the web function, for serverless
 *   hosts such as Vercel that cannot run background processes.
 *
 * Defaults to `inline` on Vercel and `worker` elsewhere. Jobs are claimed
 * with leases, so both runners can safely overlap.
 */
export type GenerationJobRunner = 'worker' | 'inline';

export const generationJobRunner = (
  env: NodeJS.ProcessEnv = process.env,
): GenerationJobRunner => {
  const configured = env.GENERATION_JOB_RUNNER;
  if (configured === 'inline' || configured === 'worker') return configured;
  return env.VERCEL ? 'inline' : 'worker';
};

/** Keep below the maxDuration of every route that schedules jobs (300s). */
const INLINE_BUDGET_MS = 280_000;

const positiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Runs queued world and narrative jobs until none remain or the time budget
 * would not fit another full generation. The first claimable job always runs;
 * later ones start only when `reserveMs` (a worst-case job) still fits, so a
 * job is never started just to be cut off by the platform timeout.
 */
export async function drainGenerationJobs({
  budgetMs = INLINE_BUDGET_MS,
  reserveMs = positiveNumber(
    process.env.WATCHER_GENERATION_TIMEOUT_MS,
    240_000,
  ),
  world = new WorldGenerationService(prisma),
  narrative = new NarrativeGenerationService(prisma),
}: {
  budgetMs?: number;
  reserveMs?: number;
  world?: Pick<WorldGenerationService, 'runNextJob'>;
  narrative?: Pick<NarrativeGenerationService, 'runNextJob'>;
} = {}): Promise<number> {
  const deadline = Date.now() + budgetMs;
  let processed = 0;

  while (processed === 0 || Date.now() + reserveMs <= deadline) {
    const jobId = (await world.runNextJob()) ?? (await narrative.runNextJob());
    if (!jobId) break;
    processed += 1;
  }

  return processed;
}

/**
 * Call from route handlers that enqueue jobs or poll their status. In inline
 * mode it drains the queue after the response is sent; polling doubles as the
 * recovery path for jobs whose lease expired.
 */
export function scheduleGenerationJobs(): void {
  if (generationJobRunner() !== 'inline') return;

  after(async () => {
    try {
      await drainGenerationJobs();
    } catch (error) {
      console.error(
        '[generation-runner] Inline job run failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  });
}

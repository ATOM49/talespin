import { NextRequest, NextResponse } from 'next/server';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { NarrativeGenerationService } from '@/lib/api/narrative-generation.service';
import { EXPLORER_ONLY, requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { scheduleGenerationJobs } from '@/lib/jobs/generation-runner';

// Leaves time for queued generation jobs to run inline after the response
// on serverless hosts (see scheduleGenerationJobs).
export const maxDuration = 300;

const narrative = new NarrativeGenerationService(prisma);
type Params = Promise<{ storyId: string; jobId: string }>;

export async function POST(_request: NextRequest, context: { params: Params }) {
  try {
    const user = await requireUser(EXPLORER_ONLY);
    const { storyId, jobId } = await context.params;
    const job = await narrative.retryJob(jobId, user.id);
    if (job.storyId !== storyId)
      throw new ApiError(404, 'Narrative job not found');
    scheduleGenerationJobs();
    return NextResponse.json(job);
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { WorldGenerationService } from '@/lib/api/world-generation.service';
import { handleApiError } from '@/lib/api/errors';
import { requireUser, BUILDER_ONLY } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { scheduleGenerationJobs } from '@/lib/jobs/generation-runner';

// Leaves time for queued generation jobs to run inline after the response
// on serverless hosts (see scheduleGenerationJobs).
export const maxDuration = 300;

const worldGenerationService = new WorldGenerationService(prisma);

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(BUILDER_ONLY);
    const body = await request.json();
    const job = await worldGenerationService.createJob(body, user.id);
    scheduleGenerationJobs();
    return NextResponse.json(job, { status: 202 });
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { GameplayService } from '@/lib/api/gameplay.service';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { EXPLORER_ONLY, requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { scheduleGenerationJobs } from '@/lib/jobs/generation-runner';

// Leaves time for queued generation jobs to run inline after the response
// on serverless hosts (see scheduleGenerationJobs).
export const maxDuration = 300;

const gameplay = new GameplayService(prisma);
type Params = Promise<{ storyId: string; missionId: string }>;

export async function GET(_request: NextRequest, context: { params: Params }) {
  try {
    const user = await requireUser(EXPLORER_ONLY);
    const { storyId, missionId } = await context.params;
    const view = await gameplay.getMission(missionId, user.id);
    if (view.story._id !== storyId)
      throw new ApiError(404, 'Mission not found');
    scheduleGenerationJobs();
    return NextResponse.json(view);
  } catch (error) {
    return handleApiError(error);
  }
}

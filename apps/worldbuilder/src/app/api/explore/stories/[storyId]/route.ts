import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api/errors';
import { GameplayService } from '@/lib/api/gameplay.service';
import { EXPLORER_ONLY, requireUser } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { scheduleGenerationJobs } from '@/lib/jobs/generation-runner';

// Leaves time for queued generation jobs to run inline after the response
// on serverless hosts (see scheduleGenerationJobs).
export const maxDuration = 300;

const gameplayService = new GameplayService(prisma);
type Params = Promise<{ storyId: string }>;

export async function GET(_request: NextRequest, context: { params: Params }) {
  try {
    const user = await requireUser(EXPLORER_ONLY);
    const { storyId } = await context.params;
    const story = await gameplayService.getStory(storyId, user.id);
    scheduleGenerationJobs();
    return NextResponse.json(story);
  } catch (error) {
    return handleApiError(error);
  }
}

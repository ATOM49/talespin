import { NextRequest, NextResponse } from 'next/server';
import { drainGenerationJobs } from '@/lib/jobs/generation-runner';

// Vercel Cron backstop for queued or lease-expired generation jobs. The
// middleware lets /api/internal through; this route checks CRON_SECRET.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    request.headers.get('authorization') !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const processed = await drainGenerationJobs();
  return NextResponse.json({ processed });
}

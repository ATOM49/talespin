import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ApiError, handleApiError } from '@/lib/api/errors';
import { GridService } from '@/lib/api/grid.service';
import { requireUser, BUILDER_ONLY } from '@/lib/auth/guards';
import { WorldGridFormSchema } from '@talespin/schema';

const gridService = new GridService(prisma);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id: worldId } = await context.params;
    const payload = await gridService.getWorldGrid(worldId);
    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(BUILDER_ONLY);
    const { id: worldId } = await context.params;
    const body = await request.json();
    const validatedData = WorldGridFormSchema.parse(body);

    // Replace the grid with new dimensions
    const payload = await gridService.replaceGrid(worldId, {
      width: validatedData.width,
      height: validatedData.height,
      home: validatedData.homeCellId
        ? undefined
        : {
            x: Math.floor(validatedData.width / 2),
            y: Math.floor(validatedData.height / 2),
          },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return handleApiError(error);
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { WorldService } from '@/lib/api/world.service';
import { WorldFormSchema } from '@talespin/schema';
import { handleApiError } from '@/lib/api/errors';
import { prisma } from '@/lib/prisma';
import { requireUser, BUILDER_ONLY } from '@/lib/auth/guards';

const worldService = new WorldService(prisma);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const world = await worldService.getWorld(id);
    return NextResponse.json(world);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(BUILDER_ONLY);
    const data = await req.json();
    const { id } = await params;
    const validatedData = WorldFormSchema.parse(data);

    const world = await worldService.updateWorld(id, validatedData);
    return NextResponse.json(world);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(BUILDER_ONLY);
    const { id } = await params;
    await worldService.deleteWorld(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}

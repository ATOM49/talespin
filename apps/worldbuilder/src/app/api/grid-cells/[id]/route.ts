import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { handleApiError } from '@/lib/api/errors';
import { GridService } from '@/lib/api/grid.service';
import { GridCellFormSchema } from '@talespin/schema';
import { requireUser, BUILDER_ONLY } from '@/lib/auth/guards';

const gridService = new GridService(prisma);

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser(BUILDER_ONLY);
    const { id } = await context.params;
    const data = await req.json();

    // Validate input using the schema, but allow partial updates since it's a form submission
    // We might want to use a partial schema or just pick the fields we allow updating
    const validated = GridCellFormSchema.partial().parse(data);

    const result = await gridService.updateCell(id, validated);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

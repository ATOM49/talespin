import { Prisma, PrismaClient, FactionCategory } from '@prisma/client';
import {
  Faction,
  FactionForm,
  FactionFormSchema,
  FactionMetaSchema,
} from '@talespin/schema';
import { ApiError } from './errors';
import { FactionQueryParams, FactionQueryParamsSchema } from './types';
import {
  FactionImageRequestSchema,
  FactionImageRequestInput,
  ImageGenerationService,
} from './ai-image.service';

type PrismaFaction = Prisma.FactionGetPayload<{
  select: typeof factionSelect.select;
}>;

const factionSelect = {
  select: {
    id: true,
    worldId: true,
    name: true,
    summary: true,
    description: true,
    previewUrl: true,
    category: true,
    meta: true,
    createdAt: true,
    updatedAt: true,
  },
} as const;

export class FactionService {
  constructor(private prisma: PrismaClient) {}

  async listFactions(
    worldId: string,
    query?: FactionQueryParams,
  ): Promise<Faction[]> {
    const parsed = FactionQueryParamsSchema.parse(query ?? {});

    const where: Prisma.FactionWhereInput = {
      worldId,
    };

    if (parsed.category) {
      where.category = parsed.category as FactionCategory;
    }

    if (parsed.search) {
      where.OR = [
        {
          name: {
            contains: parsed.search,
            mode: 'insensitive',
          },
        },
        {
          summary: {
            contains: parsed.search,
            mode: 'insensitive',
          },
        },
      ];
    }

    const factions = await this.prisma.faction.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: factionSelect.select,
    });

    return factions.map((faction) => this.mapFactionToDto(faction));
  }

  async getFaction(worldId: string, id: string): Promise<Faction> {
    const faction = await this.prisma.faction.findUnique({
      where: { id },
      select: factionSelect.select,
    });

    if (!faction || faction.worldId !== worldId) {
      throw new ApiError(404, 'Faction not found');
    }

    return this.mapFactionToDto(faction);
  }

  async createFaction(worldId: string, data: FactionForm): Promise<Faction> {
    const validated = FactionFormSchema.parse(data);

    const previewUrl =
      validated.previewUrl || (await this.generatePreview(validated));

    const faction = await this.prisma.faction.create({
      data: {
        worldId,
        name: validated.name,
        summary: validated.summary || null,
        description: validated.description || null,
        previewUrl: previewUrl || null,
        category: validated.category as FactionCategory,
        meta: (validated.meta as Prisma.InputJsonValue) || null,
      },
      select: factionSelect.select,
    });

    return this.mapFactionToDto(faction);
  }

  async updateFaction(
    worldId: string,
    id: string,
    data: FactionForm,
  ): Promise<Faction> {
    const validated = FactionFormSchema.parse(data);

    const existing = await this.prisma.faction.findUnique({
      where: { id },
      select: { worldId: true, previewUrl: true },
    });

    if (!existing || existing.worldId !== worldId) {
      throw new ApiError(404, 'Faction not found');
    }

    const previewUrl =
      validated.previewUrl ??
      existing.previewUrl ??
      (await this.generatePreview(validated));

    const faction = await this.prisma.faction.update({
      where: { id },
      data: {
        name: validated.name,
        summary: validated.summary || null,
        description: validated.description || null,
        previewUrl: previewUrl || null,
        category: validated.category as FactionCategory,
        meta: (validated.meta as Prisma.InputJsonValue) || null,
      },
      select: factionSelect.select,
    });

    return this.mapFactionToDto(faction);
  }

  async deleteFaction(worldId: string, id: string): Promise<void> {
    const existing = await this.prisma.faction.findUnique({
      where: { id },
      select: { worldId: true },
    });

    if (!existing || existing.worldId !== worldId) {
      throw new ApiError(404, 'Faction not found');
    }

    await this.prisma.faction.delete({ where: { id } });
  }

  private mapFactionToDto(faction: PrismaFaction): Faction {
    const meta = FactionMetaSchema.parse(
      faction.meta || { keywords: [], characterHooks: [] },
    );

    return {
      _id: faction.id,
      worldId: faction.worldId,
      name: faction.name,
      summary: faction.summary ?? '',
      description: faction.description ?? '',
      previewUrl: faction.previewUrl ?? '',
      category: faction.category,
      meta,
      createdAt: faction.createdAt.toISOString(),
      updatedAt: faction.updatedAt.toISOString(),
    };
  }

  private async generatePreview(data: FactionForm): Promise<string | null> {
    // Only generate if we have enough info
    if (
      !data.description &&
      !data.summary &&
      !data.meta.keywords.length &&
      !data.meta.tone
    ) {
      return null;
    }

    const payload = this.buildImagePayload(data);

    try {
      return await new ImageGenerationService().generateImageUrl(
        '/generate/faction',
        payload,
        FactionImageRequestSchema,
      );
    } catch (error) {
      console.error('Failed to generate faction preview:', error);
      return null;
    }
  }

  private buildImagePayload(data: FactionForm): FactionImageRequestInput {
    return {
      name: data.name,
      category: data.category,
      summary: data.summary,
      description: data.description,
      tone: data.meta.tone,
      keywords: data.meta.keywords,
    };
  }
}

import { Prisma, PrismaClient } from '@prisma/client';
import type { WorldQueryParams } from './types';
import { ApiError } from './errors';
import {
  WorldFormSchema,
  WorldLoreSchema,
  type World,
  type WorldForm,
} from '@talespin/schema';
import { WorldQueryParamsSchema } from './types';
import { ImageGenerationService } from './ai-image.service';
import { GridService } from './grid.service';

type PrismaWorld = {
  id: string;
  version: number;
  name: string;
  description: string | null;
  theme: string | null;
  contextWindowLimit: number | null;
  mapImageUrl: string | null;
  settings: Prisma.JsonValue | null;
  lore: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

const worldSelect = {
  select: {
    id: true,
    version: true,
    name: true,
    description: true,
    theme: true,
    contextWindowLimit: true,
    mapImageUrl: true,
    settings: true,
    lore: true,
    createdAt: true,
    updatedAt: true,
  },
} as const;

export class WorldService {
  constructor(private prisma: PrismaClient) {}

  async listWorlds(queryParams: WorldQueryParams) {
    const parsedParams = WorldQueryParamsSchema.parse(queryParams);
    const { page, limit, sortBy, sortOrder, search } = parsedParams;

    const where: Prisma.WorldWhereInput = {};

    if (search) {
      where.name = {
        contains: search as string,
        mode: 'insensitive' as const,
      };
    }

    const [total, worlds] = await Promise.all([
      this.prisma.world.count({ where }),
      this.prisma.world.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: {
          [sortBy as string]: sortOrder,
        },
        select: worldSelect.select,
      }),
    ]);

    const totalPages = Math.ceil(total / Number(limit));

    return {
      data: worlds.map((world) => this.mapWorldToDto(world as PrismaWorld)),
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async getWorld(id: string): Promise<World> {
    const world = await this.prisma.world.findUnique({
      where: { id },
      select: worldSelect.select,
    });

    if (!world) {
      throw new ApiError(404, 'World not found');
    }

    return this.mapWorldToDto(world as PrismaWorld);
  }

  async createWorld(data: WorldForm): Promise<World> {
    let world: PrismaWorld | null = null;
    let mapImageUrl: string | null = null;

    try {
      // Step 1: Create the world in the database first
      world = (await this.prisma.world.create({
        data: {
          name: data.name,
          description: data.description || null,
          theme: data.theme || null,
          contextWindowLimit: data.contextWindowLimit || 1024,
          settings: data.settings || null,
          lore: data.lore ? (data.lore as Prisma.InputJsonValue) : null,
          mapImageUrl: null, // Will be updated later
        },
        select: worldSelect.select,
      })) as unknown as PrismaWorld;

      console.log(`World created with ID: ${world.id}`);

      await new GridService(this.prisma).createDefaultGrid(world.id);

      // Step 2: Generate the map image (non-blocking, but we wait for it)
      try {
        mapImageUrl = await new ImageGenerationService().generateImageUrl(
          '/generate/map',
          data,
          WorldFormSchema,
        );
      } catch (imageError) {
        // Log the error but don't fail the world creation
        console.error(
          'Failed to generate map image, world created without image:',
          imageError,
        );
      }

      // Step 3: Update the world with the map image URL if generation succeeded
      if (mapImageUrl && world) {
        try {
          world = (await this.prisma.world.update({
            where: { id: world.id },
            data: { mapImageUrl },
            select: worldSelect.select,
          })) as unknown as PrismaWorld;
          console.log(`World ${world.id} updated with map image URL`);
        } catch (updateError) {
          // Log the error but return the world without the image
          console.error(
            'Failed to update world with map image URL:',
            updateError,
          );
          // The world still exists, just without the image URL
        }
      }

      return this.mapWorldToDto(world);
    } catch (error) {
      // If world creation failed, ensure we don't leave orphaned data
      if (world?.id) {
        try {
          await new GridService(this.prisma).cleanup(world.id);
          await this.prisma.world.delete({ where: { id: world.id } });
          console.log(`Rolled back world creation for ID: ${world.id}`);
        } catch (rollbackError) {
          console.error('Failed to rollback world creation:', rollbackError);
        }
      }

      // Re-throw the original error
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ApiError(409, 'World with this name already exists');
        }
      }
      throw error;
    }
  }

  async updateWorld(id: string, data: WorldForm): Promise<World> {
    try {
      const world = await this.prisma.world.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description || null,
          theme: data.theme || null,
          contextWindowLimit: data.contextWindowLimit || 1024,
          settings: data.settings || null,
          lore: data.lore ? (data.lore as Prisma.InputJsonValue) : null,
          mapImageUrl: data.mapImageUrl || null,
        },
        select: worldSelect.select,
      });

      return this.mapWorldToDto(world as unknown as PrismaWorld);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new ApiError(404, 'World not found');
        }
      }
      throw error;
    }
  }

  async deleteWorld(id: string): Promise<void> {
    try {
      await this.prisma.character.deleteMany({ where: { worldId: id } });
      await this.prisma.region.deleteMany({ where: { worldId: id } });
      await this.prisma.faction.deleteMany({ where: { worldId: id } });
      await new GridService(this.prisma).cleanup(id);
      await this.prisma.world.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new ApiError(404, 'World not found');
        }
      }
      throw error;
    }
  }

  private mapWorldToDto(world: PrismaWorld): World {
    return {
      _id: world.id,
      version: world.version,
      name: world.name,
      description: world.description || undefined,
      theme: world.theme ? (world.theme as World['theme']) : undefined,
      contextWindowLimit: world.contextWindowLimit ?? 1024,
      mapImageUrl: world.mapImageUrl || undefined,
      settings: world.settings
        ? (world.settings as World['settings'])
        : undefined,
      lore: world.lore ? WorldLoreSchema.parse(world.lore) : undefined,
      createdAt: world.createdAt.toISOString(),
      updatedAt: world.updatedAt.toISOString(),
    };
  }
}

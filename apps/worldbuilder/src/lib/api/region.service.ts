import { Prisma, PrismaClient } from '@prisma/client';
import { RegionSchema, type Region } from '@talespin/schema';
import { ApiError } from './errors';

const regionSelect = {
  select: {
    id: true,
    worldId: true,
    gridId: true,
    cellIds: true,
    name: true,
    summary: true,
    description: true,
    biome: true,
    atmosphere: true,
    mapBounds: true,
    missionHooks: true,
    factionPresence: true,
    createdAt: true,
    updatedAt: true,
  },
} as const;

type PrismaRegion = Prisma.RegionGetPayload<typeof regionSelect>;

export class RegionService {
  constructor(private readonly prisma: PrismaClient) {}

  async listRegions(worldId: string): Promise<Region[]> {
    const regions = await this.prisma.region.findMany({
      where: { worldId },
      orderBy: { name: 'asc' },
      select: regionSelect.select,
    });

    return regions.map((region) => this.mapRegionToDto(region));
  }

  async getRegion(worldId: string, id: string): Promise<Region> {
    const region = await this.prisma.region.findUnique({
      where: { id },
      select: regionSelect.select,
    });

    if (!region || region.worldId !== worldId) {
      throw new ApiError(404, 'Region not found');
    }

    return this.mapRegionToDto(region);
  }

  private mapRegionToDto(region: PrismaRegion): Region {
    return RegionSchema.parse({
      _id: region.id,
      worldId: region.worldId,
      gridId: region.gridId,
      cellIds: region.cellIds,
      name: region.name,
      summary: region.summary,
      description: region.description,
      biome: region.biome,
      atmosphere: region.atmosphere,
      mapBounds: region.mapBounds,
      missionHooks: region.missionHooks,
      factionPresence: region.factionPresence,
      createdAt: region.createdAt.toISOString(),
      updatedAt: region.updatedAt.toISOString(),
    });
  }
}

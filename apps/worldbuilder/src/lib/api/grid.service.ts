import { Prisma, PrismaClient } from '@prisma/client';
import { normalizeTraversal } from '@talespin/game-engine';
import { ApiError } from './errors';
import {
  TraversalProfileSchema,
  type GridCell,
  type TraversalProfile,
  type WorldGrid,
} from '@talespin/schema';

export const DEFAULT_GRID_WIDTH = 8;
export const DEFAULT_GRID_HEIGHT = 8;
const PENDING_HOME_CELL_ID = '__pending_home_cell__';

export type GridCellTemplate = {
  x: number;
  y: number;
  walkable?: boolean;
  traversal?: TraversalProfile;
  biome?: string;
  name?: string;
  description?: string;
  tags?: string[];
};

export type GridTemplate = {
  width: number;
  height: number;
  home?: { x: number; y: number };
  cells?: GridCellTemplate[];
};

const gridSelect = {
  select: {
    id: true,
    worldId: true,
    width: true,
    height: true,
    homeCellId: true,
    cells: {
      select: {
        id: true,
        gridId: true,
        x: true,
        y: true,
        walkable: true,
        traversal: true,
        biome: true,
        name: true,
        description: true,
        tags: true,
      },
      orderBy: {
        y: 'asc' as const,
      },
    },
  },
} as const;

type PrismaGrid = {
  id: string;
  worldId: string;
  width: number;
  height: number;
  homeCellId: string;
  cells: Array<{
    id: string;
    gridId: string;
    x: number;
    y: number;
    walkable: boolean;
    traversal: unknown;
    biome: string | null;
    name: string | null;
    description: string | null;
    tags: string[];
  }>;
};

type TraversalRegion = {
  cellIds: string[];
  name: string;
  biome: string;
  atmosphere: string;
};

const regionTermsByCell = (regions: TraversalRegion[]) => {
  const terms = new Map<string, string[]>();
  regions.forEach((region) => {
    region.cellIds.forEach((cellId) => {
      terms.set(cellId, [region.name, region.biome, region.atmosphere]);
    });
  });
  return terms;
};

export class GridService {
  constructor(private readonly prisma: PrismaClient) {}

  async getWorldGrid(
    worldId: string,
  ): Promise<{ grid: WorldGrid; cells: GridCell[] }> {
    const [grid, regions] = await Promise.all([
      this.prisma.worldGrid.findUnique({
        where: { worldId },
        select: gridSelect.select,
      }),
      this.prisma.region.findMany({
        where: { worldId },
        select: { cellIds: true, name: true, biome: true, atmosphere: true },
      }),
    ]);

    if (!grid) {
      throw new ApiError(404, 'World grid not found');
    }

    return this.mapGrid(
      grid as PrismaGrid,
      regionTermsByCell(regions as TraversalRegion[]),
    );
  }

  async updateCell(cellId: string, data: Partial<GridCell>) {
    const cell = await this.prisma.gridCell.update({
      where: { id: cellId },
      data: {
        walkable: data.walkable,
        traversal: data.traversal as Prisma.InputJsonValue | undefined,
        biome: data.biome,
        name: data.name,
        description: data.description,
        tags: data.tags,
      },
    });

    return {
      _id: cell.id,
      gridId: cell.gridId,
      x: cell.x,
      y: cell.y,
      walkable: cell.walkable,
      traversal:
        TraversalProfileSchema.safeParse(cell.traversal).data ??
        normalizeTraversal({
          walkable: cell.walkable,
          biome: cell.biome ?? undefined,
          name: cell.name ?? undefined,
          tags: cell.tags,
        }),
      biome: cell.biome ?? undefined,
      name: cell.name ?? undefined,
      description: cell.description ?? undefined,
      tags: cell.tags ?? [],
    };
  }

  async backfillTraversalProfiles(): Promise<number> {
    const cells = await this.prisma.gridCell.findMany({
      select: {
        id: true,
        gridId: true,
        walkable: true,
        traversal: true,
        biome: true,
        name: true,
        tags: true,
      },
    });
    const gridIds = Array.from(new Set(cells.map((cell) => cell.gridId)));
    const regions = await this.prisma.region.findMany({
      where: { gridId: { in: gridIds } },
      select: { cellIds: true, name: true, biome: true, atmosphere: true },
    });
    const regionTerms = regionTermsByCell(regions);
    const missing = cells.filter(
      (cell) => !TraversalProfileSchema.safeParse(cell.traversal).success,
    );
    await Promise.all(
      missing.map((cell) =>
        this.prisma.gridCell.update({
          where: { id: cell.id },
          data: {
            traversal: normalizeTraversal({
              walkable: cell.walkable,
              biome: cell.biome ?? undefined,
              name: cell.name ?? undefined,
              tags: [...cell.tags, ...(regionTerms.get(cell.id) ?? [])],
            }) as Prisma.InputJsonValue,
          },
        }),
      ),
    );
    return missing.length;
  }

  async createDefaultGrid(
    worldId: string,
    options?: { width?: number; height?: number },
  ) {
    const template: GridTemplate = {
      width: options?.width ?? DEFAULT_GRID_WIDTH,
      height: options?.height ?? DEFAULT_GRID_HEIGHT,
    };

    return this.createGrid(worldId, template);
  }

  async createGrid(worldId: string, template: GridTemplate) {
    console.log(
      `[grid] Creating ${template.width}x${template.height} grid for world ${worldId}...`,
    );

    return this.persistGrid(worldId, template);
  }

  async replaceGrid(worldId: string, template: GridTemplate) {
    await this.cleanup(worldId);
    return this.createGrid(worldId, template);
  }

  async cleanup(worldId: string) {
    const grid = await this.prisma.worldGrid.findUnique({
      where: { worldId },
      select: { id: true },
    });

    if (!grid) {
      console.log(
        `[grid] No grid found for world ${worldId}, nothing to clean up`,
      );
      return;
    }

    await this.prisma.gridCell.deleteMany({ where: { gridId: grid.id } });
    await this.prisma.worldGrid.delete({ where: { id: grid.id } });
    console.log(
      `[grid] Deleted grid ${grid.id} and associated cells for world ${worldId}`,
    );
  }

  private async persistGrid(worldId: string, template: GridTemplate) {
    const grid = await this.prisma.worldGrid.create({
      data: {
        worldId,
        width: template.width,
        height: template.height,
        homeCellId: PENDING_HOME_CELL_ID,
      },
      select: { id: true },
    });

    const cellPayload = this.buildCells(grid.id, template);
    await this.prisma.gridCell.createMany({ data: cellPayload });
    console.log(
      `[grid] Inserted ${cellPayload.length} cells for grid ${grid.id}`,
    );

    const home = template.home ?? {
      x: Math.floor(template.width / 2),
      y: Math.floor(template.height / 2),
    };

    const homeCell = await this.prisma.gridCell.findFirst({
      where: {
        gridId: grid.id,
        x: home.x,
        y: home.y,
      },
      select: { id: true },
    });

    if (!homeCell) {
      throw new Error('Failed to locate home cell for new grid');
    }

    await this.prisma.worldGrid.update({
      where: { id: grid.id },
      data: { homeCellId: homeCell.id },
    });

    console.log(`[grid] Home cell for grid ${grid.id} set to ${homeCell.id}`);

    return this.getWorldGrid(worldId);
  }

  private buildCells(
    gridId: string,
    template: GridTemplate,
  ): Prisma.GridCellCreateManyInput[] {
    const overrides = new Map<string, GridCellTemplate>();
    template.cells?.forEach((cell) => {
      overrides.set(`${cell.x}:${cell.y}`, cell);
    });

    const payload: Prisma.GridCellCreateManyInput[] = [];
    for (let y = 0; y < template.height; y += 1) {
      for (let x = 0; x < template.width; x += 1) {
        const override = overrides.get(`${x}:${y}`);
        const walkable = override?.walkable ?? true;
        const biome = override?.biome;
        const name = override?.name;
        const tags = override?.tags ?? [];
        payload.push({
          gridId,
          x,
          y,
          walkable,
          traversal: (override?.traversal ??
            normalizeTraversal({
              walkable,
              biome,
              name,
              tags,
            })) as Prisma.InputJsonValue,
          biome: biome ?? null,
          name: name ?? null,
          description: override?.description ?? null,
          tags,
        });
      }
    }

    return payload;
  }

  private mapGrid(
    grid: PrismaGrid,
    regionTerms: Map<string, string[]> = new Map(),
  ): { grid: WorldGrid; cells: GridCell[] } {
    return {
      grid: {
        _id: grid.id,
        worldId: grid.worldId,
        width: grid.width,
        height: grid.height,
        homeCellId: grid.homeCellId,
      },
      cells: grid.cells.map((cell) => ({
        _id: cell.id,
        gridId: cell.gridId,
        x: cell.x,
        y: cell.y,
        walkable: cell.walkable,
        traversal:
          TraversalProfileSchema.safeParse(cell.traversal).data ??
          normalizeTraversal({
            walkable: cell.walkable,
            biome: cell.biome ?? undefined,
            name: cell.name ?? undefined,
            tags: [...(cell.tags ?? []), ...(regionTerms.get(cell.id) ?? [])],
          }),
        biome: cell.biome ?? undefined,
        name: cell.name ?? undefined,
        description: cell.description ?? undefined,
        tags: cell.tags ?? [],
      })),
    };
  }
}

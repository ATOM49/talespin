import { Prisma, PrismaClient } from '@prisma/client';
import { normalizeTraversal } from '@talespin/game-engine';
import {
  WorldBlueprintSchema,
  WorldGenerationJobSchema,
  WorldCreationSeedSchema,
  type ParsedWorldCreationSeed,
  type WorldBlueprint,
  type WorldGenerationJob,
} from '@talespin/schema';
import { ApiError } from './errors';
import {
  DEFAULT_GRID_HEIGHT,
  DEFAULT_GRID_WIDTH,
  type GridCellTemplate,
} from './grid.service';
import { watcherHeaders } from './watcher-client';

type GenerationOptions = {
  watcherBaseUrl?: string;
  generationTimeoutMs?: number;
};

const coordinateKey = (x: number, y: number) => `${x}:${y}`;
const PENDING_HOME_CELL_ID = '__pending_home_cell__';
const PERSISTENCE_LEASE_MS = 2 * 60 * 1000;

type GenerationJobRecord = Prisma.WorldGenerationJobGetPayload<object>;

const interruptedAttemptWhere = (
  now: Date,
): Prisma.WorldGenerationJobWhereInput => ({
  status: { in: ['GENERATING', 'PERSISTING'] },
  OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
});

const dispatchableJobWhere = (
  now: Date,
): Prisma.WorldGenerationJobWhereInput => ({
  OR: [{ status: 'QUEUED' }, interruptedAttemptWhere(now)],
});

const retryableJobWhere = (now: Date): Prisma.WorldGenerationJobWhereInput => ({
  OR: [{ status: 'FAILED' }, interruptedAttemptWhere(now)],
});

export class WorldGenerationService {
  private readonly watcherBaseUrl: string;
  private readonly generationTimeout: number;

  constructor(
    private readonly prisma: PrismaClient,
    options?: GenerationOptions,
  ) {
    const configuredTimeout = Number(
      process.env.WATCHER_WORLD_GENERATION_TIMEOUT_MS ||
        process.env.WATCHER_GENERATION_TIMEOUT_MS ||
        600000,
    );

    this.watcherBaseUrl = (
      options?.watcherBaseUrl ||
      process.env.WATCHER_API_URL ||
      'http://localhost:4000'
    ).replace(/\/$/, '');
    this.generationTimeout =
      options?.generationTimeoutMs ??
      (Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 600000);
  }

  async createJob(
    seedInput: unknown,
    userId: string,
  ): Promise<WorldGenerationJob> {
    const seed = WorldCreationSeedSchema.parse(seedInput);
    const job = await this.prisma.worldGenerationJob.create({
      data: {
        userId,
        seed: seed as Prisma.InputJsonValue,
      },
    });

    return this.mapJob(job);
  }

  async getJob(jobId: string, userId: string): Promise<WorldGenerationJob> {
    const job = await this.prisma.worldGenerationJob.findFirst({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new ApiError(404, 'World generation job not found');
    }

    return this.mapJob(job);
  }

  async retryJob(jobId: string, userId: string): Promise<WorldGenerationJob> {
    const existing = await this.prisma.worldGenerationJob.findFirst({
      where: { id: jobId, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'World generation job not found');
    }
    if (existing.status === 'COMPLETED' || existing.status === 'QUEUED') {
      return this.mapJob(existing);
    }

    const requeued = await this.prisma.worldGenerationJob.updateMany({
      where: {
        id: jobId,
        userId,
        ...retryableJobWhere(new Date()),
      },
      data: {
        status: 'QUEUED',
        error: null,
        leaseExpiresAt: null,
        startedAt: null,
        finishedAt: null,
      },
    });

    if (requeued.count !== 1) {
      throw new ApiError(409, 'World generation is already running');
    }

    return this.getJob(jobId, userId);
  }

  async runNextJob(): Promise<string | null> {
    const candidate = await this.prisma.worldGenerationJob.findFirst({
      where: dispatchableJobWhere(new Date()),
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true },
    });

    if (!candidate) return null;

    try {
      await this.runJob(candidate.id, candidate.userId);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 409) return null;
      throw error;
    }

    return candidate.id;
  }

  async runJob(jobId: string, userId: string): Promise<WorldGenerationJob> {
    const existing = await this.prisma.worldGenerationJob.findFirst({
      where: { id: jobId, userId },
    });

    if (!existing) {
      throw new ApiError(404, 'World generation job not found');
    }
    if (existing.status === 'COMPLETED') {
      return this.mapJob(existing);
    }

    const now = new Date();
    const leaseExpiresAt = new Date(
      now.getTime() + this.generationTimeout + PERSISTENCE_LEASE_MS,
    );
    const claimed = await this.prisma.worldGenerationJob.updateMany({
      where: {
        id: jobId,
        userId,
        ...dispatchableJobWhere(now),
      },
      data: {
        status: 'GENERATING',
        attempt: { increment: 1 },
        error: null,
        startedAt: now,
        finishedAt: null,
        leaseExpiresAt,
      },
    });

    if (claimed.count !== 1) {
      throw new ApiError(409, 'World generation is already running');
    }

    const job = await this.prisma.worldGenerationJob.findFirstOrThrow({
      where: { id: jobId, userId },
    });
    const seed = WorldCreationSeedSchema.parse(job.seed);
    const attempt = job.attempt;

    try {
      let blueprint: WorldBlueprint | undefined;
      if (job.blueprint) {
        const checkpoint = WorldBlueprintSchema.safeParse(job.blueprint);
        if (checkpoint.success) {
          blueprint = checkpoint.data;
        } else {
          await this.prisma.worldGenerationJob.updateMany({
            where: { id: jobId, userId, attempt, status: 'GENERATING' },
            data: { blueprint: null },
          });
        }
      }

      if (!blueprint) {
        blueprint = await this.requestBlueprint(seed);
      }
      this.validateBlueprint(seed, blueprint);

      const checkpointed = await this.prisma.worldGenerationJob.updateMany({
        where: { id: jobId, userId, attempt, status: 'GENERATING' },
        data: {
          status: 'PERSISTING',
          blueprint: blueprint as Prisma.InputJsonValue,
          leaseExpiresAt: new Date(Date.now() + PERSISTENCE_LEASE_MS),
        },
      });
      if (checkpointed.count !== 1) {
        throw new ApiError(409, 'A newer world generation attempt took over');
      }

      await this.persistBlueprint(jobId, userId, attempt, seed, blueprint);
    } catch (error) {
      await this.failAttempt(jobId, userId, attempt, error);
    }

    return this.getJob(jobId, userId);
  }

  private async requestBlueprint(
    seed: ParsedWorldCreationSeed,
  ): Promise<WorldBlueprint> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.generationTimeout,
    );

    try {
      const response = await fetch(
        `${this.watcherBaseUrl}/generate/world-blueprint`,
        {
          method: 'POST',
          headers: watcherHeaders(),
          body: JSON.stringify(seed),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        const details = await response.text();
        throw new ApiError(502, 'World blueprint generation failed', {
          watcherStatus: response.status,
          details,
        });
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ApiError(
          502,
          'World blueprint generator returned invalid JSON',
        );
      }

      const parsed = WorldBlueprintSchema.safeParse(payload);
      if (!parsed.success) {
        throw new ApiError(502, 'World blueprint failed validation', {
          issues: parsed.error.issues,
        });
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ApiError(504, 'World blueprint generation timed out');
      }
      throw new ApiError(502, 'Unable to reach the world blueprint generator');
    } finally {
      clearTimeout(timeout);
    }
  }

  private validateBlueprint(
    seed: ParsedWorldCreationSeed,
    blueprint: WorldBlueprint,
  ) {
    const issues: string[] = [];

    if (blueprint.context.theme !== seed.theme) {
      issues.push(
        'The generated world theme does not match the requested theme.',
      );
    }
    if (blueprint.regions.length !== seed.regionCount) {
      issues.push(
        `Expected ${seed.regionCount} regions, received ${blueprint.regions.length}.`,
      );
    }
    if (blueprint.factions.length !== seed.factionCount) {
      issues.push(
        `Expected ${seed.factionCount} factions, received ${blueprint.factions.length}.`,
      );
    }

    const expectedCharacterCount =
      seed.factionCount * seed.charactersPerFaction;
    if (blueprint.characters.length !== expectedCharacterCount) {
      issues.push(
        `Expected ${expectedCharacterCount} characters, received ${blueprint.characters.length}.`,
      );
    }

    const regionKeys = this.collectUniqueKeys(
      blueprint.regions,
      'region',
      issues,
    );
    const factionKeys = this.collectUniqueKeys(
      blueprint.factions,
      'faction',
      issues,
    );
    this.collectUniqueKeys(blueprint.characters, 'character', issues);

    const coveredCells = new Set<string>();
    for (const region of blueprint.regions) {
      for (const coordinate of region.cellCoordinates) {
        if (
          coordinate.x < 0 ||
          coordinate.x >= DEFAULT_GRID_WIDTH ||
          coordinate.y < 0 ||
          coordinate.y >= DEFAULT_GRID_HEIGHT
        ) {
          issues.push(
            `Region ${region.key} contains out-of-bounds cell ${coordinateKey(coordinate.x, coordinate.y)}.`,
          );
          continue;
        }

        const key = coordinateKey(coordinate.x, coordinate.y);
        if (coveredCells.has(key)) {
          issues.push(`Grid cell ${key} is assigned more than once.`);
        }
        coveredCells.add(key);
      }
    }

    const expectedCellCount = DEFAULT_GRID_WIDTH * DEFAULT_GRID_HEIGHT;
    if (coveredCells.size !== expectedCellCount) {
      issues.push(
        `Regions cover ${coveredCells.size} of ${expectedCellCount} grid cells.`,
      );
    }

    const assignmentRegionKeys = new Set<string>();
    const assignedFactionKeys = new Set<string>();
    for (const assignment of blueprint.assignments) {
      if (!regionKeys.has(assignment.regionKey)) {
        issues.push(
          `Assignment references unknown region key ${assignment.regionKey}.`,
        );
      }
      if (assignmentRegionKeys.has(assignment.regionKey)) {
        issues.push(
          `Region ${assignment.regionKey} has more than one assignment record.`,
        );
      }
      assignmentRegionKeys.add(assignment.regionKey);

      const assignmentFactionKeys = new Set<string>();
      for (const presence of assignment.factions) {
        if (!factionKeys.has(presence.factionKey)) {
          issues.push(
            `Assignment references unknown faction key ${presence.factionKey}.`,
          );
        }
        if (assignmentFactionKeys.has(presence.factionKey)) {
          issues.push(
            `Region ${assignment.regionKey} repeats faction ${presence.factionKey}.`,
          );
        }
        assignmentFactionKeys.add(presence.factionKey);
        assignedFactionKeys.add(presence.factionKey);
      }
    }

    for (const regionKey of regionKeys) {
      if (!assignmentRegionKeys.has(regionKey)) {
        issues.push(`Region ${regionKey} does not have a faction assignment.`);
      }
    }
    for (const factionKey of factionKeys) {
      if (!assignedFactionKeys.has(factionKey)) {
        issues.push(`Faction ${factionKey} is not present in any region.`);
      }
    }

    const charactersByFaction = new Map<string, number>();
    for (const character of blueprint.characters) {
      if (!factionKeys.has(character.factionKey)) {
        issues.push(
          `Character ${character.key} references unknown faction key ${character.factionKey}.`,
        );
      }
      charactersByFaction.set(
        character.factionKey,
        (charactersByFaction.get(character.factionKey) ?? 0) + 1,
      );
    }

    for (const factionKey of factionKeys) {
      const count = charactersByFaction.get(factionKey) ?? 0;
      if (count !== seed.charactersPerFaction) {
        issues.push(
          `Faction ${factionKey} has ${count} characters; expected ${seed.charactersPerFaction}.`,
        );
      }
    }

    if (issues.length) {
      throw new ApiError(502, 'World blueprint references are invalid', {
        issues,
      });
    }
  }

  private collectUniqueKeys(
    items: Array<{ key: string }>,
    label: string,
    issues: string[],
  ) {
    const keys = new Set<string>();
    for (const item of items) {
      if (keys.has(item.key)) {
        issues.push(`Duplicate ${label} key ${item.key}.`);
      }
      keys.add(item.key);
    }
    return keys;
  }

  private async persistBlueprint(
    jobId: string,
    userId: string,
    attempt: number,
    seed: ParsedWorldCreationSeed,
    blueprint: WorldBlueprint,
  ): Promise<string> {
    return this.prisma.$transaction(
      async (transaction) => {
        const currentAttempt = await transaction.worldGenerationJob.findFirst({
          where: {
            id: jobId,
            userId,
            attempt,
            status: 'PERSISTING',
          },
          select: { id: true },
        });
        if (!currentAttempt) {
          throw new ApiError(409, 'A newer world generation attempt took over');
        }

        const world = await transaction.world.create({
          data: {
            name: blueprint.context.name,
            description: blueprint.context.description,
            theme: blueprint.context.theme,
            contextWindowLimit: 1024,
            mapImageUrl: blueprint.mapImageUrl,
            lore: blueprint.context.lore as Prisma.InputJsonValue,
            settings: {
              generationSeed: seed,
            } as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        const gridPayload = this.buildGridCells(blueprint);
        const grid = await transaction.worldGrid.create({
          data: {
            worldId: world.id,
            width: DEFAULT_GRID_WIDTH,
            height: DEFAULT_GRID_HEIGHT,
            homeCellId: PENDING_HOME_CELL_ID,
          },
          select: { id: true },
        });
        await transaction.gridCell.createMany({
          data: gridPayload.map((cell) => ({
            gridId: grid.id,
            x: cell.x,
            y: cell.y,
            walkable: cell.walkable ?? true,
            traversal: (cell.traversal ??
              normalizeTraversal({
                walkable: cell.walkable ?? true,
                biome: cell.biome,
                name: cell.name,
                tags: cell.tags ?? [],
              })) as Prisma.InputJsonValue,
            biome: cell.biome ?? null,
            name: cell.name ?? null,
            description: cell.description ?? null,
            tags: cell.tags ?? [],
          })),
        });

        const persistedCells = await transaction.gridCell.findMany({
          where: { gridId: grid.id },
          select: { id: true, x: true, y: true },
        });
        const homeCell = persistedCells.find(
          (cell) =>
            cell.x === Math.floor(DEFAULT_GRID_WIDTH / 2) &&
            cell.y === Math.floor(DEFAULT_GRID_HEIGHT / 2),
        );
        if (!homeCell) {
          throw new Error('Failed to locate home cell for generated world');
        }
        await transaction.worldGrid.update({
          where: { id: grid.id },
          data: { homeCellId: homeCell.id },
        });

        const factionIds = new Map<string, string>();
        for (const generated of blueprint.factions) {
          const { faction } = generated;
          const created = await transaction.faction.create({
            data: {
              worldId: world.id,
              name: faction.name,
              summary: faction.summary || null,
              description: faction.description || null,
              previewUrl: faction.previewUrl || null,
              category: faction.category,
              meta: faction.meta as Prisma.InputJsonValue,
            },
            select: { id: true },
          });
          factionIds.set(generated.key, created.id);
        }

        const cellsByCoordinate = new Map(
          persistedCells.map((cell) => [
            coordinateKey(cell.x, cell.y),
            cell.id,
          ]),
        );
        const assignmentsByRegion = new Map(
          blueprint.assignments.map((assignment) => [
            assignment.regionKey,
            assignment,
          ]),
        );

        for (const region of blueprint.regions) {
          const assignment = assignmentsByRegion.get(region.key);
          if (!assignment) {
            throw new Error(`Missing validated assignment for ${region.key}`);
          }

          const cellIds = region.cellCoordinates.map((coordinate) => {
            const cellId = cellsByCoordinate.get(
              coordinateKey(coordinate.x, coordinate.y),
            );
            if (!cellId) {
              throw new Error(
                `Missing persisted grid cell ${coordinateKey(coordinate.x, coordinate.y)}`,
              );
            }
            return cellId;
          });

          const factionPresence = assignment.factions.map((presence) => {
            const factionId = factionIds.get(presence.factionKey);
            if (!factionId) {
              throw new Error(
                `Missing persisted faction ${presence.factionKey}`,
              );
            }
            return {
              factionId,
              influence: presence.influence,
              rationale: presence.rationale,
            };
          });

          await transaction.region.create({
            data: {
              worldId: world.id,
              gridId: grid.id,
              cellIds,
              name: region.name,
              summary: region.summary,
              description: region.description,
              biome: region.biome,
              atmosphere: region.atmosphere,
              mapBounds: region.mapBounds as Prisma.InputJsonValue,
              missionHooks: region.missionHooks,
              factionPresence: factionPresence as Prisma.InputJsonValue,
            },
          });
        }

        for (const generated of blueprint.characters) {
          const factionId = factionIds.get(generated.factionKey);
          if (!factionId) {
            throw new Error(
              `Missing persisted faction ${generated.factionKey}`,
            );
          }

          await transaction.character.create({
            data: {
              worldId: world.id,
              name: generated.name,
              description: generated.description,
              biography: generated.biography,
              previewUrl: generated.previewUrl || null,
              gallery: null,
              promptHint: generated.promptHint,
              traits: generated.traits,
              factionIds: [factionId],
              cultureIds: [],
              speciesIds: [],
              archetypeIds: [],
              meta: generated.meta as Prisma.InputJsonValue,
            },
          });
        }

        const completed = await transaction.worldGenerationJob.updateMany({
          where: {
            id: jobId,
            userId,
            attempt,
            status: 'PERSISTING',
          },
          data: {
            status: 'COMPLETED',
            resultWorldId: world.id,
            error: null,
            leaseExpiresAt: null,
            finishedAt: new Date(),
          },
        });
        if (completed.count !== 1) {
          throw new ApiError(409, 'A newer world generation attempt took over');
        }

        return world.id;
      },
      {
        maxWait: 10_000,
        timeout: PERSISTENCE_LEASE_MS,
      },
    );
  }

  private async failAttempt(
    jobId: string,
    userId: string,
    attempt: number,
    error: unknown,
  ) {
    const message =
      error instanceof ApiError
        ? error.message
        : 'World creation stopped before it could finish.';
    await this.prisma.worldGenerationJob.updateMany({
      where: {
        id: jobId,
        userId,
        attempt,
        status: { in: ['GENERATING', 'PERSISTING'] },
      },
      data: {
        status: 'FAILED',
        error: message,
        leaseExpiresAt: null,
        finishedAt: new Date(),
      },
    });
  }

  private async mapJob(job: GenerationJobRecord): Promise<WorldGenerationJob> {
    const seed = WorldCreationSeedSchema.parse(job.seed);
    const leaseExpired =
      (job.status === 'GENERATING' || job.status === 'PERSISTING') &&
      (!job.leaseExpiresAt || job.leaseExpiresAt.getTime() <= Date.now());
    const retryable = job.status === 'FAILED' || leaseExpired;

    let result: WorldGenerationJob['result'];
    if (job.status === 'COMPLETED' && job.resultWorldId) {
      const [regions, factions, characters] = await Promise.all([
        this.prisma.region.count({ where: { worldId: job.resultWorldId } }),
        this.prisma.faction.count({ where: { worldId: job.resultWorldId } }),
        this.prisma.character.count({ where: { worldId: job.resultWorldId } }),
      ]);
      result = {
        worldId: job.resultWorldId,
        regions,
        factions,
        characters,
      };
    }

    return WorldGenerationJobSchema.parse({
      jobId: job.id,
      status: job.status,
      seed,
      attempt: job.attempt,
      retryable,
      blueprintAvailable: Boolean(job.blueprint),
      error:
        job.error ??
        (leaseExpired
          ? 'The previous generation attempt stopped responding. You can retry safely.'
          : undefined),
      result,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  }

  private buildGridCells(blueprint: WorldBlueprint): GridCellTemplate[] {
    return blueprint.regions.flatMap((region) =>
      region.cellCoordinates.map((coordinate) => ({
        x: coordinate.x,
        y: coordinate.y,
        walkable: true,
        traversal: normalizeTraversal({
          walkable: true,
          biome: region.biome,
          name: region.name,
          tags: region.visualDetails,
        }),
        biome: region.biome,
        name: region.name,
        description: region.summary,
        tags: [
          `region:${region.key}`,
          `atmosphere:${region.atmosphere}`,
          ...region.visualDetails,
        ],
      })),
    );
  }
}

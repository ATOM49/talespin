import { Prisma, PrismaClient } from '@prisma/client';
import {
  applyStoryStateChanges,
  chooseTransport,
  evaluateObjectives,
  fallbackTransportOptions,
  findTerrainRoute,
  normalizeTraversal,
  requiredObjectivesComplete,
} from '@talespin/game-engine';
import {
  GeneratedInteractionProposalSchema,
  InteractionOutcomeSchema,
  InteractionTargetSchema,
  MissionObjectiveSchema,
  MissionSetupProposalSchema,
  NarrativeGenerationResponseSchema,
  NarrativeJobSchema,
  PlayerActionSchema,
  StoryOutlineProposalSchema,
  StoryStateSchema,
  TransportOptionsProposalSchema,
  TravelPlanSchema,
  TraversalMediumSchema,
  TraversalProfileSchema,
  type GridCell,
  type InteractionKind,
  type InteractionOutcome,
  type MissionObjective,
  type MissionSetupProposal,
  type NarrativeGenerationRequest,
  type NarrativeGenerationResponse,
  type NarrativeJob,
  type StoryOutlineProposal,
} from '@talespin/schema';
import { ApiError } from './errors';
import { watcherHeaders } from './watcher-client';

const LEASE_MS = 5 * 60 * 1000;

type GenerationOptions = {
  watcherBaseUrl?: string;
  generationTimeoutMs?: number;
};

const interruptedWhere = (now: Date): Prisma.NarrativeJobWhereInput => ({
  status: 'GENERATING',
  OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }],
});

const dispatchableWhere = (now: Date): Prisma.NarrativeJobWhereInput => ({
  OR: [{ status: 'QUEUED' }, interruptedWhere(now)],
});

const toGridCell = (cell: {
  id: string;
  gridId: string;
  x: number;
  y: number;
  walkable: boolean;
  traversal: Prisma.JsonValue | null;
  biome: string | null;
  name: string | null;
  description: string | null;
  tags: string[];
}): GridCell => ({
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
  tags: cell.tags,
});

export class NarrativeGenerationService {
  private readonly watcherBaseUrl: string;
  private readonly generationTimeout: number;

  constructor(
    private readonly prisma: PrismaClient,
    options?: GenerationOptions,
  ) {
    this.watcherBaseUrl = (
      options?.watcherBaseUrl ??
      process.env.WATCHER_API_URL ??
      'http://localhost:4000'
    ).replace(/\/$/, '');
    this.generationTimeout =
      options?.generationTimeoutMs ??
      Number(process.env.WATCHER_GENERATION_TIMEOUT_MS ?? 180000);
  }

  async runNextJob(): Promise<string | null> {
    const candidate = await this.prisma.narrativeJob.findFirst({
      where: dispatchableWhere(new Date()),
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!candidate) return null;
    await this.runJob(candidate.id);
    return candidate.id;
  }

  async runJob(jobId: string): Promise<NarrativeJob> {
    const current = await this.prisma.narrativeJob.findUnique({
      where: { id: jobId },
    });
    if (!current) throw new ApiError(404, 'Narrative job not found');
    if (current.status === 'COMPLETED') return this.mapJob(current);

    const now = new Date();
    const claimed = await this.prisma.narrativeJob.updateMany({
      where: { id: jobId, ...dispatchableWhere(now) },
      data: {
        status: 'GENERATING',
        attempt: { increment: 1 },
        error: null,
        startedAt: now,
        finishedAt: null,
        leaseExpiresAt: new Date(
          now.getTime() + this.generationTimeout + LEASE_MS,
        ),
      },
    });
    if (claimed.count !== 1)
      throw new ApiError(409, 'Narrative job is already running');

    const job = await this.prisma.narrativeJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    try {
      if (job.kind === 'OUTLINE') await this.generateOutline(job.id);
      if (job.kind === 'MISSION_SETUP')
        await this.generateMission(job.id, job.targetId);
      if (job.kind === 'INTERACTION')
        await this.generateInteraction(job.id, job.targetId, job.input);
      if (job.kind === 'ACTION_RESOLUTION') {
        await this.resolveInteraction(job.id, job.targetId);
      }
      if (job.kind === 'TRANSPORT')
        await this.generateTransport(job.id, job.targetId, job.input);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Narrative generation failed';
      await this.prisma.$transaction([
        this.prisma.narrativeJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            error: message,
            leaseExpiresAt: null,
            finishedAt: new Date(),
          },
        }),
        ...(job.kind === 'OUTLINE' || job.kind === 'MISSION_SETUP'
          ? [
              this.prisma.story.update({
                where: { id: job.storyId },
                data: { setupStatus: 'FAILED', setupError: message },
              }),
            ]
          : []),
        ...(job.kind === 'TRANSPORT'
          ? [
              this.prisma.interaction.update({
                where: { id: job.targetId },
                data: { status: 'READY' },
              }),
            ]
          : []),
      ]);
    }

    return this.mapJob(
      await this.prisma.narrativeJob.findUniqueOrThrow({
        where: { id: jobId },
      }),
    );
  }

  async retryJob(jobId: string, userId: string): Promise<NarrativeJob> {
    const job = await this.prisma.narrativeJob.findFirst({
      where: { id: jobId, story: { participants: { some: { userId } } } },
    });
    if (!job) throw new ApiError(404, 'Narrative job not found');
    if (job.status !== 'FAILED') return this.mapJob(job);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const requeued = await transaction.narrativeJob.update({
        where: { id: job.id },
        data: {
          status: 'QUEUED',
          error: null,
          leaseExpiresAt: null,
          startedAt: null,
          finishedAt: null,
        },
      });
      if (job.kind === 'OUTLINE' || job.kind === 'MISSION_SETUP') {
        await transaction.story.update({
          where: { id: job.storyId },
          data: { setupStatus: 'GENERATING', setupError: null },
        });
      }
      return requeued;
    });
    return this.mapJob(updated);
  }

  private async generateOutline(jobId: string) {
    const job = await this.prisma.narrativeJob.findUniqueOrThrow({
      where: { id: jobId },
      include: {
        story: {
          include: {
            world: true,
            participants: { include: { character: true } },
          },
        },
      },
    });
    const regions = await this.prisma.region.findMany({
      where: { worldId: job.story.worldId },
      select: { missionHooks: true },
    });
    const character = job.story.participants[0]?.character;
    if (!character) throw new Error('Story has no playable character.');
    const request: NarrativeGenerationRequest = {
      kind: 'OUTLINE',
      input: {
        storyId: job.story.id,
        world: {
          name: job.story.world.name,
          description: job.story.world.description ?? undefined,
          theme: job.story.world.theme ?? undefined,
          lore: job.story.world.lore ?? undefined,
        },
        character: {
          name: character.name,
          description: character.description ?? undefined,
          traits: character.traits,
        },
        regionHooks: regions.flatMap((region) => region.missionHooks),
      },
    };
    const response = await this.requestGeneration(request);
    if (response.kind !== 'OUTLINE')
      throw new Error('Watcher returned the wrong proposal kind.');
    const proposal = StoryOutlineProposalSchema.parse(response.proposal);
    const state = StoryStateSchema.parse(job.story.state);

    await this.prisma.$transaction(async (transaction) => {
      await transaction.story.update({
        where: { id: job.story.id },
        data: {
          title: proposal.title,
          premise: proposal.premise,
          setupStatus: 'GENERATING',
          setupError: null,
        },
      });
      let firstChapterId = '';
      for (const chapter of [...proposal.chapters].sort(
        (a, b) => a.order - b.order,
      )) {
        const persisted = await transaction.chapter.upsert({
          where: {
            storyId_order: { storyId: job.story.id, order: chapter.order },
          },
          update: {
            title: chapter.title,
            summary: chapter.summary,
            missionPrompt: chapter.missionPrompt,
          },
          create: {
            storyId: job.story.id,
            order: chapter.order,
            title: chapter.title,
            summary: chapter.summary,
            missionPrompt: chapter.missionPrompt,
            checkpointState: state as Prisma.InputJsonValue,
          },
        });
        if (chapter.order === 1) firstChapterId = persisted.id;
      }
      if (!firstChapterId) throw new Error('Outline did not create Chapter 1.');
      await transaction.narrativeJob.upsert({
        where: { dedupeKey: `mission-setup:${firstChapterId}:1` },
        update: {},
        create: {
          storyId: job.story.id,
          kind: 'MISSION_SETUP',
          targetId: firstChapterId,
          dedupeKey: `mission-setup:${firstChapterId}:1`,
        },
      });
      await transaction.narrativeJob.update({
        where: { id: job.id },
        data: {
          status: 'COMPLETED',
          proposal: proposal as Prisma.InputJsonValue,
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
    });
  }

  private async generateMission(jobId: string, chapterId: string) {
    const chapter = await this.prisma.chapter.findUniqueOrThrow({
      where: { id: chapterId },
      include: {
        story: {
          include: {
            world: { include: { worldGrid: { include: { cells: true } } } },
          },
        },
      },
    });
    const grid = chapter.story.world.worldGrid;
    if (!grid || grid.cells.length === 0)
      throw new Error('World has no movement grid.');
    const cells = grid.cells.map(toGridCell);
    const priorMission = await this.prisma.mission.findFirst({
      where: { storyId: chapter.storyId, status: 'SUCCESS' },
      orderBy: { endedAt: 'desc' },
    });
    const startCellId = priorMission?.destinationCellId ?? grid.homeCellId;
    const storyState = StoryStateSchema.parse(chapter.story.state);
    const request: NarrativeGenerationRequest = {
      kind: 'MISSION_SETUP',
      input: {
        storyTitle: chapter.story.title,
        storyPremise: chapter.story.premise ?? chapter.story.title,
        chapterTitle: chapter.title,
        chapterSummary: chapter.summary,
        missionPrompt: chapter.missionPrompt,
        startCellId,
        cells: cells.map((cell) => ({
          id: cell._id,
          name: cell.name,
          biome: cell.biome,
          tags: cell.tags,
        })),
        isFinale: chapter.order === 3,
        knownFacts: storyState.knownFacts,
        consequences: storyState.consequences,
      },
    };
    const response = await this.requestGeneration(request);
    if (response.kind !== 'MISSION_SETUP')
      throw new Error('Watcher returned the wrong proposal kind.');
    const proposal = MissionSetupProposalSchema.parse(response.proposal);
    const previousDestinations = new Set(
      (
        await this.prisma.mission.findMany({
          where: { storyId: chapter.storyId },
          select: { destinationCellId: true },
        })
      ).map((mission) => mission.destinationCellId),
    );
    const destination = this.selectDestination(
      cells,
      startCellId,
      proposal.destinationHint,
      previousDestinations,
    );
    const route = findTerrainRoute(cells, startCellId, destination._id);
    const waypointCellId =
      route[Math.max(1, Math.floor(route.length / 2))] ?? destination._id;
    const factKey = `chapter-${chapter.order}-discovery`;
    const objectives: MissionObjective[] = [
      {
        id: `reach-${destination._id}`,
        type: 'REACH_CELL',
        label: `Reach ${destination.name ?? 'the mission destination'}`,
        required: true,
        complete: false,
        cellId: destination._id,
      },
      {
        id: `encounter-${chapter.id}`,
        type: 'RESOLVE_INTERACTION',
        label: 'Speak with a character who can set the chapter in motion',
        required: true,
        complete: false,
        interactionKind: 'DIALOGUE',
      },
      {
        id: `fact-${chapter.id}`,
        type: 'LEARN_FACT',
        label: 'Uncover the truth hidden in this chapter',
        required: true,
        complete: false,
        factKey,
      },
      ...(chapter.order === 3
        ? [
            {
              id: `finale-${chapter.id}`,
              type: 'RESOLVE_INTERACTION' as const,
              label: 'Resolve the final confrontation',
              required: true,
              complete: false,
              interactionKind: 'FINALE' as const,
            },
          ]
        : []),
    ].map((objective) => MissionObjectiveSchema.parse(objective));

    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.mission.findFirst({
        where: {
          chapterId: chapter.id,
          status: { in: ['PREPARING', 'ACTIVE'] },
        },
      });
      const mission =
        existing ??
        (await transaction.mission.create({
          data: {
            storyId: chapter.storyId,
            chapterId: chapter.id,
            title: proposal.title,
            summary: proposal.summary,
            status: 'ACTIVE',
            startCellId,
            destinationCellId: destination._id,
            waypointCellIds: [waypointCellId],
            encounterCellIds: [],
            currentCellId: startCellId,
            revealedCellIds: [startCellId],
            objectives: objectives as Prisma.InputJsonValue,
            maxActions: Math.max(proposal.maxActions, route.length + 8),
          },
        }));
      const interactionDedupeKey = `interaction:${mission.id}:${startCellId}:DIALOGUE:initial`;
      await transaction.narrativeJob.upsert({
        where: { dedupeKey: interactionDedupeKey },
        update: {},
        create: {
          storyId: chapter.storyId,
          kind: 'INTERACTION',
          targetId: mission.id,
          dedupeKey: interactionDedupeKey,
          input: { cellId: startCellId, kind: 'DIALOGUE', isFinale: false },
        },
      });
      await transaction.chapter.update({
        where: { id: chapter.id },
        data: {
          status: 'ACTIVE',
          checkpointState: storyState as Prisma.InputJsonValue,
        },
      });
      await transaction.story.update({
        where: { id: chapter.storyId },
        data: { setupStatus: 'READY', setupError: null },
      });
      await transaction.narrativeJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          proposal: proposal as Prisma.InputJsonValue,
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
    });
  }

  private async generateInteraction(
    jobId: string,
    missionId: string,
    rawInput: Prisma.JsonValue | null,
  ) {
    const jobInput = (
      rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
        ? rawInput
        : {}
    ) as Record<string, Prisma.JsonValue>;
    const cellId =
      typeof jobInput.cellId === 'string' ? jobInput.cellId : undefined;
    const requestedKind =
      typeof jobInput.kind === 'string' ? jobInput.kind : 'DIALOGUE';
    const isFinale = jobInput.isFinale === true;
    if (!cellId) throw new Error('Interaction job is missing a cell.');
    const mission = await this.prisma.mission.findUniqueOrThrow({
      where: { id: missionId },
      include: { story: true, chapter: true },
    });
    const cell = await this.prisma.gridCell.findUniqueOrThrow({
      where: { id: cellId },
    });
    const participant = await this.prisma.storyParticipant.findFirstOrThrow({
      where: { storyId: mission.storyId },
    });
    const worldCharacter = await this.prisma.character.findFirst({
      where: {
        worldId: mission.story.worldId,
        id: { not: participant.characterId },
        OR: [{ userId: null }, { userId: { isSet: false } }],
      },
      orderBy: { createdAt: 'asc' },
    });
    const storyState = StoryStateSchema.parse(mission.story.state);
    const request: NarrativeGenerationRequest = {
      kind: 'INTERACTION',
      input: {
        storyTitle: mission.story.title,
        chapterTitle: mission.chapter.title,
        missionTitle: mission.title,
        cell: toGridCell(cell),
        character: worldCharacter
          ? {
              name: worldCharacter.name,
              description: worldCharacter.description ?? undefined,
            }
          : undefined,
        isFinale,
        knownFacts: storyState.knownFacts,
      },
    };
    const response = await this.requestGeneration(request);
    if (response.kind !== 'INTERACTION')
      throw new Error('Watcher returned the wrong proposal kind.');
    const proposal = GeneratedInteractionProposalSchema.parse(
      response.proposal,
    );

    await this.prisma.$transaction(async (transaction) => {
      let target: Prisma.InputJsonObject = { type: 'CELL', cellId };
      if (worldCharacter) {
        target = { type: 'WORLD_CHARACTER', characterId: worldCharacter.id };
      } else if (proposal.character) {
        const character = await transaction.storyCharacter.create({
          data: {
            storyId: mission.storyId,
            name: proposal.character.name,
            description: proposal.character.description,
            traits: proposal.character.traits,
            currentCellId: cellId,
          },
        });
        target = { type: 'STORY_CHARACTER', storyCharacterId: character.id };
      }
      const latest = await transaction.interaction.findFirst({
        where: { missionId },
        orderBy: { sequence: 'desc' },
        select: { sequence: true },
      });
      const kind: InteractionKind = isFinale
        ? 'FINALE'
        : requestedKind === 'DISCOVERY'
          ? 'DISCOVERY'
          : 'DIALOGUE';
      await transaction.interaction.create({
        data: {
          missionId,
          sequence: (latest?.sequence ?? -1) + 1,
          kind,
          status: 'READY',
          cellId,
          target,
          blocking: true,
          situation: proposal.situation,
          choices: proposal.choices as Prisma.InputJsonValue,
          transportOptions: [],
        },
      });
      await transaction.narrativeJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          proposal: proposal as Prisma.InputJsonValue,
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
    });
  }

  private async generateTransport(
    jobId: string,
    interactionId: string,
    rawInput: Prisma.JsonValue | null,
  ) {
    const jobInput = (
      rawInput && typeof rawInput === 'object' && !Array.isArray(rawInput)
        ? rawInput
        : {}
    ) as Record<string, Prisma.JsonValue>;
    const medium = TraversalMediumSchema.parse(jobInput.medium);
    const interaction = await this.prisma.interaction.findUniqueOrThrow({
      where: { id: interactionId },
      include: { mission: { include: { story: true } } },
    });
    const plan = TravelPlanSchema.parse(interaction.mission.travelPlan);
    const request: NarrativeGenerationRequest = {
      kind: 'TRANSPORT',
      input: {
        storyTitle: interaction.mission.story.title,
        missionTitle: interaction.mission.title,
        medium,
        terrainTags: Array.isArray(jobInput.terrainTags)
          ? jobInput.terrainTags.filter(
              (tag): tag is string => typeof tag === 'string',
            )
          : [],
        situation: interaction.situation,
      },
    };
    const response = await this.requestGeneration(request);
    if (response.kind !== 'TRANSPORT')
      throw new Error('Watcher returned the wrong proposal kind.');
    const proposed = TransportOptionsProposalSchema.parse(response.proposal);
    const candidates = [
      ...proposed.options,
      ...fallbackTransportOptions(medium),
    ];
    const valid = candidates.filter((option, index, options) => {
      if (
        options.findIndex((candidate) => candidate.id === option.id) !== index
      )
        return false;
      try {
        chooseTransport(plan, option);
        return true;
      } catch {
        return false;
      }
    });
    if (valid.length < 2)
      throw new Error('No valid transport choices were generated.');

    await this.prisma.$transaction([
      this.prisma.interaction.update({
        where: { id: interaction.id },
        data: {
          status: 'READY',
          transportOptions: valid.slice(0, 3) as Prisma.InputJsonValue,
        },
      }),
      this.prisma.narrativeJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          proposal: { options: valid.slice(0, 3) },
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      }),
    ]);
  }

  private async resolveInteraction(jobId: string, interactionId: string) {
    const interaction = await this.prisma.interaction.findUniqueOrThrow({
      where: { id: interactionId },
      include: { mission: { include: { story: true, chapter: true } } },
    });
    const action = PlayerActionSchema.parse(interaction.playerAction);
    const objectives = MissionObjectiveSchema.array().parse(
      interaction.mission.objectives,
    );
    const request: NarrativeGenerationRequest = {
      kind: 'ACTION_RESOLUTION',
      input: {
        situation: interaction.situation,
        action,
        objectiveIds: objectives.map((objective) => objective.id),
      },
    };
    const response = await this.requestGeneration(request);
    if (response.kind !== 'ACTION_RESOLUTION') {
      throw new Error('Watcher returned the wrong proposal kind.');
    }
    const proposed = InteractionOutcomeSchema.parse(response.proposal);
    if (!proposed.accepted) {
      await this.prisma.$transaction([
        this.prisma.interaction.update({
          where: { id: interaction.id },
          data: {
            status: 'READY',
            outcome: proposed as Prisma.InputJsonValue,
            resolvedAt: null,
          },
        }),
        this.prisma.narrativeJob.update({
          where: { id: jobId },
          data: {
            status: 'COMPLETED',
            proposal: proposed as Prisma.InputJsonValue,
            finishedAt: new Date(),
            leaseExpiresAt: null,
          },
        }),
      ]);
      return;
    }
    // Model output may narrate progress, but objective completion is evaluated
    // from authoritative position, interaction kind, facts, and inventory.
    const completedObjectiveIds: string[] = [];
    const target = InteractionTargetSchema.parse(interaction.target);
    const allowedCharacterRefs =
      target.type === 'WORLD_CHARACTER'
        ? [target.characterId]
        : target.type === 'STORY_CHARACTER'
          ? [target.storyCharacterId]
          : [];
    const changes = proposed.stateChanges.filter(
      (change) =>
        change.type !== 'UPDATE_RELATIONSHIP' ||
        allowedCharacterRefs.includes(change.characterRef),
    );
    for (const objective of objectives) {
      if (
        interaction.kind !== 'DISCOVERY' ||
        objective.type !== 'LEARN_FACT' ||
        objective.complete
      )
        continue;
      if (
        !changes.some(
          (change) =>
            change.type === 'DISCOVER_FACT' && change.key === objective.factKey,
        )
      ) {
        changes.push({
          type: 'DISCOVER_FACT',
          key: objective.factKey,
          summary: `A truth uncovered during ${interaction.mission.chapter.title}.`,
        });
      }
    }
    const outcome: InteractionOutcome = {
      ...proposed,
      stateChanges: changes,
      completedObjectiveIds,
    };
    const currentState = StoryStateSchema.parse(
      interaction.mission.story.state,
    );
    const nextState = applyStoryStateChanges(currentState, changes, {
      allowedCharacterRefs,
    });
    const nextObjectives = evaluateObjectives({
      objectives,
      currentCellId: interaction.mission.currentCellId,
      resolvedInteractionKind: interaction.kind,
      knownFacts: nextState.knownFacts,
      inventoryItemKeys: nextState.inventory.map((item) => item.key),
      usedItemKeys: nextState.usedItemKeys,
      completedObjectiveIds,
    });
    const actionsUsed = interaction.mission.actionsUsed + 1;
    const missionComplete =
      interaction.mission.currentCellId ===
        interaction.mission.destinationCellId &&
      requiredObjectivesComplete(nextObjectives);
    const missionFailed =
      !missionComplete && actionsUsed >= interaction.mission.maxActions;
    const endedAt = missionComplete || missionFailed ? new Date() : null;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.story.update({
        where: { id: interaction.mission.storyId },
        data: { state: nextState as unknown as Prisma.InputJsonValue },
      });
      await transaction.interaction.update({
        where: { id: interaction.id },
        data: {
          status: 'RESOLVED',
          outcome: outcome as Prisma.InputJsonValue,
          resolvedAt: new Date(),
        },
      });
      await transaction.mission.update({
        where: { id: interaction.missionId },
        data: {
          objectives: nextObjectives as Prisma.InputJsonValue,
          actionsUsed,
          status: missionComplete
            ? 'SUCCESS'
            : missionFailed
              ? 'FAILED'
              : 'ACTIVE',
          endedAt,
        },
      });
      if (missionComplete) {
        await transaction.chapter.update({
          where: { id: interaction.mission.chapterId },
          data: { status: 'COMPLETED', completedAt: endedAt },
        });
        if (interaction.mission.chapter.order === 3) {
          await transaction.story.update({
            where: { id: interaction.mission.storyId },
            data: {
              status: 'COMPLETED',
              completedAt: endedAt,
              setupStatus: 'READY',
            },
          });
        } else {
          const nextChapter = await transaction.chapter.findUniqueOrThrow({
            where: {
              storyId_order: {
                storyId: interaction.mission.storyId,
                order: interaction.mission.chapter.order + 1,
              },
            },
          });
          await transaction.story.update({
            where: { id: interaction.mission.storyId },
            data: { setupStatus: 'GENERATING', setupError: null },
          });
          await transaction.narrativeJob.upsert({
            where: { dedupeKey: `mission-setup:${nextChapter.id}:1` },
            update: {},
            create: {
              storyId: interaction.mission.storyId,
              kind: 'MISSION_SETUP',
              targetId: nextChapter.id,
              dedupeKey: `mission-setup:${nextChapter.id}:1`,
            },
          });
        }
      } else if (
        !missionFailed &&
        interaction.mission.chapter.order === 3 &&
        interaction.mission.currentCellId ===
          interaction.mission.destinationCellId &&
        interaction.kind !== 'FINALE'
      ) {
        const dedupeKey = `interaction:${interaction.missionId}:${interaction.mission.currentCellId}:FINALE`;
        await transaction.narrativeJob.upsert({
          where: { dedupeKey },
          update: {},
          create: {
            storyId: interaction.mission.storyId,
            kind: 'INTERACTION',
            targetId: interaction.missionId,
            dedupeKey,
            input: {
              cellId: interaction.mission.currentCellId,
              kind: 'FINALE',
              isFinale: true,
            },
          },
        });
      }
      await transaction.narrativeJob.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          proposal: outcome as Prisma.InputJsonValue,
          finishedAt: new Date(),
          leaseExpiresAt: null,
        },
      });
    });
  }

  private selectDestination(
    cells: GridCell[],
    startCellId: string,
    hint: string,
    excluded: Set<string>,
  ): GridCell {
    const terms = hint
      .toLowerCase()
      .split(/\W+/)
      .filter((term) => term.length > 3);
    const candidates = cells.filter(
      (cell) => cell._id !== startCellId && !excluded.has(cell._id),
    );
    const matching = candidates.filter((cell) => {
      const source = [cell.name, cell.biome, ...cell.tags]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return terms.some((term) => source.includes(term));
    });
    const rankReachable = (pool: GridCell[]) =>
      pool.flatMap((cell) => {
        try {
          return [
            {
              cell,
              route: findTerrainRoute(cells, startCellId, cell._id),
            },
          ];
        } catch {
          return [];
        }
      });
    const byDistance = (
      left: { route: string[] },
      right: { route: string[] },
    ) => right.route.length - left.route.length;
    const narrativeMatches = rankReachable(matching).sort(byDistance);
    const fallback = rankReachable(candidates).sort(byDistance);
    const destination = (narrativeMatches[0] ?? fallback[0])?.cell;
    if (!destination) throw new Error('No destination cell is available.');
    return destination;
  }

  private async requestGeneration(
    request: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationResponse> {
    if (process.env.E2E_TEST_MODE === 'true')
      return this.fixtureResponse(request);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.generationTimeout,
    );
    try {
      const response = await fetch(
        `${this.watcherBaseUrl}/generate/narrative`,
        {
          method: 'POST',
          headers: watcherHeaders(),
          body: JSON.stringify(request),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw new ApiError(502, 'Narrative generation failed', {
          watcherStatus: response.status,
          details: await response.text(),
        });
      }
      return NarrativeGenerationResponseSchema.parse(await response.json());
    } finally {
      clearTimeout(timeout);
    }
  }

  private fixtureResponse(
    request: NarrativeGenerationRequest,
  ): NarrativeGenerationResponse {
    if (request.kind === 'OUTLINE') {
      const proposal: StoryOutlineProposal = {
        title: `${request.input.character.name} and the Threefold Road`,
        premise: `A hidden truth calls ${request.input.character.name} across ${request.input.world.name}.`,
        chapters: [1, 2, 3].map((order) => ({
          order,
          title: ['The First Sign', 'The Broken Trail', 'The Last Crossing'][
            order - 1
          ],
          summary: `Chapter ${order} reveals another part of the world's mystery.`,
          missionPrompt: `Follow the trail and resolve the chapter ${order} encounter.`,
        })),
      };
      return {
        kind: 'OUTLINE',
        proposal: StoryOutlineProposalSchema.parse(proposal),
      };
    }
    if (request.kind === 'MISSION_SETUP') {
      const proposal: MissionSetupProposal = {
        title: request.input.chapterTitle,
        summary: request.input.chapterSummary,
        destinationHint: request.input.isFinale
          ? 'the furthest forgotten place'
          : 'a distant region',
        encounterPrompt: 'Meet a keeper of the trail.',
        discoveryPrompt: 'Discover a clue that changes the journey.',
        maxActions: 36,
      };
      return {
        kind: 'MISSION_SETUP',
        proposal: MissionSetupProposalSchema.parse(proposal),
      };
    }
    if (request.kind === 'INTERACTION') {
      return {
        kind: 'INTERACTION',
        proposal: GeneratedInteractionProposalSchema.parse({
          situation: request.input.isFinale
            ? 'The last secret waits here, demanding a final choice.'
            : 'A traveler steps from the landscape with a guarded clue.',
          kind: request.input.isFinale ? 'FINALE' : 'DIALOGUE',
          choices: [
            { id: 'listen', label: 'Listen carefully' },
            { id: 'question', label: 'Ask what they are hiding' },
          ],
          character: request.input.character
            ? undefined
            : {
                name: 'The Wayfarer',
                description:
                  'A story-bound guide with knowledge of the road ahead.',
                traits: ['watchful', 'enigmatic'],
              },
        }),
      };
    }
    if (request.kind === 'TRANSPORT') {
      return {
        kind: 'TRANSPORT',
        proposal: TransportOptionsProposalSchema.parse({
          options: fallbackTransportOptions(request.input.medium),
        }),
      };
    }
    return {
      kind: 'ACTION_RESOLUTION',
      proposal: InteractionOutcomeSchema.parse({
        narrative:
          'The choice settles into the world, revealing the next part of the path.',
        accepted: true,
        stateChanges: [
          {
            type: 'RECORD_CONSEQUENCE',
            summary: 'The explorer chose to engage.',
          },
        ],
        completedObjectiveIds: request.input.objectiveIds,
      }),
    };
  }

  private mapJob(job: {
    id: string;
    storyId: string;
    kind: Prisma.NarrativeJobGetPayload<object>['kind'];
    status: Prisma.NarrativeJobGetPayload<object>['status'];
    targetId: string;
    attempt: number;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): NarrativeJob {
    return NarrativeJobSchema.parse({
      _id: job.id,
      storyId: job.storyId,
      kind: job.kind,
      status: job.status,
      targetId: job.targetId,
      attempt: job.attempt,
      retryable: job.status === 'FAILED',
      error: job.error,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  }
}

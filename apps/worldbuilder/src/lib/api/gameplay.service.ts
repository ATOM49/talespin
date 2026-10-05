import { Prisma, PrismaClient } from '@prisma/client';
import {
  advanceTravel,
  buildTravelPlan,
  chooseTransport,
  fallbackTransportOptions,
  evaluateMissionProgress,
} from '@talespin/game-engine';
import {
  ChapterSchema,
  InteractionChoiceSchema,
  InteractionSchema,
  MissionObjectiveSchema,
  MissionPlayViewSchema,
  MissionSchema,
  StoryPlayViewSchema,
  StoryStateSchema,
  SubmitMissionActionSchema,
  TransportOptionSchema,
  TravelPlanSchema,
  type Chapter,
  type Interaction,
  type Mission,
  type MissionPlayView,
  type StoryPlayView,
  type SubmitMissionAction,
} from '@talespin/models';
import { ApiError } from './errors';
import { GridService } from './grid.service';
import { StoryService } from './story.service';

const mapChapter = (chapter: {
  id: string;
  storyId: string;
  order: number;
  title: string;
  summary: string;
  missionPrompt: string;
  status: 'PLANNED' | 'ACTIVE' | 'COMPLETED';
  createdAt: Date;
  completedAt: Date | null;
}): Chapter =>
  ChapterSchema.parse({
    _id: chapter.id,
    storyId: chapter.storyId,
    order: chapter.order,
    title: chapter.title,
    summary: chapter.summary,
    missionPrompt: chapter.missionPrompt,
    status: chapter.status,
    createdAt: chapter.createdAt.toISOString(),
    completedAt: chapter.completedAt?.toISOString() ?? null,
  });

const mapMission = (mission: {
  id: string;
  storyId: string;
  chapterId: string;
  retryOfMissionId: string | null;
  attempt: number;
  title: string;
  summary: string;
  status: 'PREPARING' | 'ACTIVE' | 'SUCCESS' | 'FAILED';
  version: number;
  startCellId: string;
  destinationCellId: string;
  waypointCellIds: string[];
  currentCellId: string;
  revealedCellIds: string[];
  objectives: Prisma.JsonValue;
  maxActions: number;
  actionsUsed: number;
  travelPlan: Prisma.JsonValue | null;
  startedAt: Date;
  endedAt: Date | null;
}): Mission => {
  const travelPlan = mission.travelPlan
    ? TravelPlanSchema.parse(mission.travelPlan)
    : null;
  return MissionSchema.parse({
    _id: mission.id,
    storyId: mission.storyId,
    chapterId: mission.chapterId,
    retryOfMissionId: mission.retryOfMissionId,
    attempt: mission.attempt,
    title: mission.title,
    summary: mission.summary,
    status: mission.status,
    version: mission.version,
    startCellId: mission.startCellId,
    destinationCellId: mission.destinationCellId,
    waypointCellIds: mission.waypointCellIds,
    currentCellId: mission.currentCellId,
    revealedCellIds: mission.revealedCellIds,
    objectives: mission.objectives,
    maxActions: mission.maxActions,
    actionsUsed: mission.actionsUsed,
    travelPlan: travelPlan
      ? {
          ...travelPlan,
          stops: travelPlan.stops.filter((stop) =>
            ['TRANSPORT', 'DESTINATION'].includes(stop.kind),
          ),
        }
      : null,
    startedAt: mission.startedAt.toISOString(),
    endedAt: mission.endedAt?.toISOString() ?? null,
  });
};

const mapInteraction = (interaction: {
  id: string;
  missionId: string;
  sequence: number;
  kind: Interaction['kind'];
  status: Interaction['status'];
  cellId: string;
  traversedCellIds: string[];
  target: Prisma.JsonValue;
  blocking: boolean;
  situation: string;
  choices: Prisma.JsonValue;
  transportOptions: Prisma.JsonValue;
  playerAction: Prisma.JsonValue | null;
  outcome: Prisma.JsonValue | null;
  createdAt: Date;
  resolvedAt: Date | null;
}): Interaction =>
  InteractionSchema.parse({
    _id: interaction.id,
    missionId: interaction.missionId,
    sequence: interaction.sequence,
    kind: interaction.kind,
    status: interaction.status,
    cellId: interaction.cellId,
    traversedCellIds: interaction.traversedCellIds,
    target: interaction.target,
    blocking: interaction.blocking,
    situation: interaction.situation,
    choices: interaction.choices,
    transportOptions: interaction.transportOptions,
    playerAction: interaction.playerAction,
    outcome: interaction.outcome,
    createdAt: interaction.createdAt.toISOString(),
    resolvedAt: interaction.resolvedAt?.toISOString() ?? null,
  });

export class GameplayService {
  private readonly stories: StoryService;
  private readonly grids: GridService;

  constructor(private readonly prisma: PrismaClient) {
    this.stories = new StoryService(prisma);
    this.grids = new GridService(prisma);
  }

  async getStory(storyId: string, userId: string): Promise<StoryPlayView> {
    const story = await this.stories.getStory(storyId, userId);
    const [chapters, activeMission, failedJob] = await Promise.all([
      this.prisma.chapter.findMany({
        where: { storyId },
        orderBy: { order: 'asc' },
      }),
      this.prisma.mission.findFirst({
        where: { storyId, status: { in: ['PREPARING', 'ACTIVE'] } },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      }),
      this.prisma.narrativeJob.findFirst({
        where: {
          storyId,
          status: 'FAILED',
          kind: { in: ['OUTLINE', 'MISSION_SETUP'] },
        },
        orderBy: { updatedAt: 'desc' },
        select: { id: true, error: true },
      }),
    ]);
    return StoryPlayViewSchema.parse({
      ...story,
      chapters: chapters.map(mapChapter),
      activeMissionId: activeMission?.id ?? null,
      failedJobId: failedJob?.id ?? null,
      generationError: failedJob?.error ?? story.setupError,
    });
  }

  async getMission(
    missionId: string,
    userId: string,
  ): Promise<MissionPlayView> {
    const mission = await this.prisma.mission.findFirst({
      where: {
        id: missionId,
        story: { participants: { some: { userId } } },
      },
      include: {
        chapter: true,
        story: {
          include: {
            chapters: { orderBy: { order: 'asc' } },
            participants: { include: { character: true } },
            world: true,
          },
        },
        interactions: { orderBy: { sequence: 'asc' } },
      },
    });
    if (!mission) throw new ApiError(404, 'Mission not found');
    const character = mission.story.participants.find(
      (participant) => participant.userId === userId,
    )?.character;
    if (!character)
      throw new ApiError(403, 'You are not a participant in this Story');
    const [grid, jobs] = await Promise.all([
      this.grids.getWorldGrid(mission.story.worldId),
      this.prisma.narrativeJob.findMany({
        where: {
          storyId: mission.storyId,
          OR: [
            { targetId: mission.id },
            {
              targetId: {
                in: mission.interactions.map((interaction) => interaction.id),
              },
            },
          ],
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);
    const interactions = mission.interactions.map(mapInteraction);
    const currentInteraction = [...interactions]
      .reverse()
      .find(
        (interaction) =>
          interaction.blocking &&
          ['READY', 'RESOLVING', 'FAILED'].includes(interaction.status),
      );
    const pending = jobs.some((job) =>
      ['QUEUED', 'GENERATING'].includes(job.status),
    );
    const failed = jobs.find((job) => job.status === 'FAILED');

    return MissionPlayViewSchema.parse({
      story: {
        _id: mission.story.id,
        title: mission.story.title,
        status: mission.story.status,
      },
      storyState: StoryStateSchema.parse(mission.story.state),
      world: this.mapWorld(mission.story.world),
      character: this.mapCharacter(character),
      chapter: mapChapter(mission.chapter),
      chapters: mission.story.chapters.map(mapChapter),
      mission: mapMission(mission),
      grid,
      currentInteraction,
      interactions: interactions.slice(-30),
      generationPending: pending,
      failedJobId: failed?.id ?? null,
      generationError: failed?.error ?? null,
    });
  }

  async submitAction(
    missionId: string,
    userId: string,
    rawInput: SubmitMissionAction,
  ): Promise<MissionPlayView> {
    const input = SubmitMissionActionSchema.parse(rawInput);
    const mission = await this.prisma.mission.findFirst({
      where: { id: missionId, story: { participants: { some: { userId } } } },
      include: {
        chapter: true,
        story: true,
        interactions: { orderBy: { sequence: 'desc' } },
      },
    });
    if (!mission) throw new ApiError(404, 'Mission not found');
    const duplicate = await this.prisma.missionAction.findUnique({
      where: { missionId_actionId: { missionId, actionId: input.actionId } },
    });
    if (duplicate?.response)
      return MissionPlayViewSchema.parse(duplicate.response);
    if (duplicate?.status === 'FAILED') {
      throw new ApiError(
        409,
        duplicate.error ?? 'This action previously failed',
      );
    }
    if (duplicate)
      throw new ApiError(409, 'This action is already being processed');
    if (mission.version !== input.expectedVersion) {
      throw new ApiError(409, 'Mission state changed; refresh before acting');
    }
    const generationPending = await this.prisma.narrativeJob.findFirst({
      where: {
        storyId: mission.storyId,
        status: { in: ['QUEUED', 'GENERATING'] },
        OR: [
          { targetId: mission.id },
          {
            targetId: {
              in: mission.interactions.map((interaction) => interaction.id),
            },
          },
        ],
      },
      select: { id: true },
    });
    if (generationPending) {
      throw new ApiError(409, 'Narrative generation is still in progress');
    }
    try {
      await this.prisma.missionAction.create({
        data: {
          missionId,
          actionId: input.actionId,
          expectedVersion: input.expectedVersion,
          request: input.action as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ApiError(409, 'This action is already being processed');
      }
      throw error;
    }

    let responseMissionId = missionId;
    try {
      if (input.action.type === 'SET_DESTINATION') {
        await this.setDestination(
          mission,
          input.action.destinationCellId,
          input.expectedVersion,
        );
      } else if (input.action.type === 'CONTINUE_TRAVEL') {
        await this.continueTravel(mission, input.expectedVersion);
      } else if (input.action.type === 'CHOOSE_TRANSPORT') {
        await this.chooseTransport(
          mission,
          input.action.optionId,
          input.expectedVersion,
        );
      } else if (
        input.action.type === 'CHOOSE_INTERACTION' ||
        input.action.type === 'FREE_TEXT'
      ) {
        await this.resolveInteraction(
          mission,
          input.action,
          input.expectedVersion,
        );
      } else if (input.action.type === 'RETRY_MISSION') {
        responseMissionId = await this.retryMission(
          mission,
          input.expectedVersion,
        );
      }
      const view = await this.getMission(responseMissionId, userId);
      await this.prisma.missionAction.update({
        where: { missionId_actionId: { missionId, actionId: input.actionId } },
        data: { status: 'COMPLETED', response: view as Prisma.InputJsonValue },
      });
      return view;
    } catch (error) {
      await this.prisma.missionAction.update({
        where: { missionId_actionId: { missionId, actionId: input.actionId } },
        data: {
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Action failed',
        },
      });
      throw error;
    }
  }

  private blockingInteraction(mission: {
    interactions: Array<{
      id: string;
      kind: Interaction['kind'];
      status: Interaction['status'];
      blocking: boolean;
      choices: Prisma.JsonValue;
      transportOptions: Prisma.JsonValue;
    }>;
  }) {
    return mission.interactions.find(
      (interaction) =>
        interaction.blocking &&
        ['READY', 'RESOLVING', 'FAILED'].includes(interaction.status),
    );
  }

  private async setDestination(
    mission: Prisma.MissionGetPayload<{
      include: { chapter: true; story: true; interactions: true };
    }>,
    destinationCellId: string,
    expectedVersion: number,
  ) {
    if (mission.status !== 'ACTIVE')
      throw new ApiError(409, 'Mission is not active');
    if (destinationCellId === mission.currentCellId) {
      throw new ApiError(400, 'The explorer is already at that cell');
    }
    if (this.blockingInteraction(mission)) {
      throw new ApiError(
        409,
        'Resolve the current interaction before travelling',
      );
    }
    const grid = await this.grids.getWorldGrid(mission.story.worldId);
    const useMissionWaypoints = destinationCellId === mission.destinationCellId;
    let plan;
    try {
      plan = buildTravelPlan({
        cells: grid.cells,
        startCellId: mission.currentCellId,
        destinationCellId,
        waypointCellIds: useMissionWaypoints ? mission.waypointCellIds : [],
        encounterCellIds: useMissionWaypoints ? mission.encounterCellIds : [],
      });
    } catch (error) {
      throw new ApiError(
        400,
        error instanceof Error ? error.message : 'Invalid destination',
      );
    }
    const firstLeg = plan.legs.find(
      (leg) =>
        leg.startIndex <= plan.currentIndex &&
        leg.endIndex >= plan.currentIndex,
    );
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.mission.updateMany({
        where: { id: mission.id, version: expectedVersion },
        data: {
          travelPlan: plan as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ApiError(409, 'Mission state changed; refresh before acting');
      }
      if (firstLeg && !firstLeg.transport) {
        const nextSequence = (mission.interactions[0]?.sequence ?? -1) + 1;
        const interaction = await transaction.interaction.create({
          data: {
            missionId: mission.id,
            sequence: nextSequence,
            kind: 'TRANSPORT',
            status: 'RESOLVING',
            cellId: mission.currentCellId,
            target: { type: 'CELL', cellId: mission.currentCellId },
            blocking: true,
            situation: `The route begins across ${firstLeg.medium.toLowerCase()} terrain. Choose how to travel.`,
            choices: [],
            transportOptions: fallbackTransportOptions(
              firstLeg.medium,
            ) as Prisma.InputJsonValue,
          },
        });
        const dedupeKey = `transport:${interaction.id}`;
        await transaction.narrativeJob.upsert({
          where: { dedupeKey },
          update: {},
          create: {
            storyId: mission.storyId,
            kind: 'TRANSPORT',
            targetId: interaction.id,
            dedupeKey,
            input: { medium: firstLeg.medium, terrainTags: [] },
          },
        });
      }
    });
  }

  private async chooseTransport(
    mission: Prisma.MissionGetPayload<{
      include: { chapter: true; story: true; interactions: true };
    }>,
    optionId: string,
    expectedVersion: number,
  ) {
    const interaction = this.blockingInteraction(mission);
    if (
      !interaction ||
      interaction.kind !== 'TRANSPORT' ||
      interaction.status !== 'READY'
    ) {
      throw new ApiError(409, 'No transport choice is waiting');
    }
    const option = TransportOptionSchema.array()
      .parse(interaction.transportOptions)
      .find((candidate) => candidate.id === optionId);
    if (!option) throw new ApiError(400, 'Unknown transport option');
    const plan = TravelPlanSchema.parse(mission.travelPlan);
    let nextPlan;
    try {
      nextPlan = chooseTransport(plan, option);
    } catch (error) {
      throw new ApiError(
        400,
        error instanceof Error ? error.message : 'Invalid transport',
      );
    }
    const state = StoryStateSchema.parse(mission.story.state);
    state.travelHistory.push(`${option.name} chosen during ${mission.title}`);
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.mission.updateMany({
        where: { id: mission.id, version: expectedVersion },
        data: {
          travelPlan: nextPlan as Prisma.InputJsonValue,
          version: { increment: 1 },
        },
      });
      if (updated.count !== 1) {
        throw new ApiError(409, 'Mission state changed; refresh before acting');
      }
      await transaction.interaction.update({
        where: { id: interaction.id },
        data: {
          status: 'RESOLVED',
          playerAction: { type: 'CHOOSE_TRANSPORT', optionId },
          outcome: {
            narrative: `${option.name} carries the journey onward.`,
            accepted: true,
            stateChanges: option.consequence
              ? [{ type: 'RECORD_CONSEQUENCE', summary: option.consequence }]
              : [],
            completedObjectiveIds: [],
          },
          resolvedAt: new Date(),
        },
      });
      await transaction.story.update({
        where: { id: mission.storyId },
        data: { state: state as Prisma.InputJsonValue },
      });
    });
  }

  private async continueTravel(
    mission: Prisma.MissionGetPayload<{
      include: { chapter: true; story: true; interactions: true };
    }>,
    expectedVersion: number,
  ) {
    if (mission.status !== 'ACTIVE')
      throw new ApiError(409, 'Mission is not active');
    if (this.blockingInteraction(mission)) {
      throw new ApiError(
        409,
        'Resolve the current interaction before travelling',
      );
    }
    const plan = TravelPlanSchema.parse(mission.travelPlan);
    let movement;
    try {
      movement = advanceTravel(plan);
    } catch (error) {
      throw new ApiError(
        409,
        error instanceof Error ? error.message : 'Travel cannot continue',
      );
    }
    const currentCellId = movement.plan.pathCellIds[movement.plan.currentIndex];
    const state = StoryStateSchema.parse(mission.story.state);
    movement.traversedCellIds.forEach((cellId) => {
      if (!state.visitedCellIds.includes(cellId))
        state.visitedCellIds.push(cellId);
    });
    const revealed = Array.from(
      new Set([...mission.revealedCellIds, ...movement.traversedCellIds]),
    );
    const actionsUsed = mission.actionsUsed + movement.actionCost;
    const { objectives, complete, failed } = evaluateMissionProgress({
      objectives: MissionObjectiveSchema.array().parse(mission.objectives),
      state,
      currentCellId,
      destinationCellId: mission.destinationCellId,
      actionsUsed,
      maxActions: mission.maxActions,
    });
    const nextSequence = (mission.interactions[0]?.sequence ?? -1) + 1;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.story.update({
        where: { id: mission.storyId },
        data: { state: state as Prisma.InputJsonValue },
      });
      await transaction.interaction.create({
        data: {
          missionId: mission.id,
          sequence: nextSequence,
          kind: 'MOVEMENT',
          status: 'RESOLVED',
          cellId: currentCellId,
          traversedCellIds: movement.traversedCellIds,
          target: { type: 'CELL', cellId: currentCellId },
          blocking: false,
          situation: `Travelled through ${movement.traversedCellIds.length} map cell${movement.traversedCellIds.length === 1 ? '' : 's'}.`,
          choices: [],
          transportOptions: [],
          playerAction: { type: 'CONTINUE_TRAVEL' },
          outcome: {
            narrative: `The journey advances to the next stop.`,
            accepted: true,
            stateChanges: [],
            completedObjectiveIds: [],
          },
          resolvedAt: new Date(),
        },
      });
      const updated = await transaction.mission.updateMany({
        where: { id: mission.id, version: expectedVersion },
        data: {
          currentCellId,
          revealedCellIds: revealed,
          objectives: objectives as Prisma.InputJsonValue,
          actionsUsed,
          travelPlan:
            movement.plan.currentIndex ===
              movement.plan.pathCellIds.length - 1 &&
            movement.stop?.kind !== 'TRANSPORT'
              ? null
              : (movement.plan as Prisma.InputJsonValue),
          version: { increment: 1 },
          status: complete ? 'SUCCESS' : failed ? 'FAILED' : 'ACTIVE',
          endedAt: complete || failed ? new Date() : null,
        },
      });
      if (updated.count !== 1) {
        throw new ApiError(409, 'Mission state changed; refresh before acting');
      }

      if (!complete && !failed && movement.stop?.kind === 'TRANSPORT') {
        const leg = movement.plan.legs.find(
          (candidate) => candidate.startIndex === movement.stop?.routeIndex,
        );
        if (leg) {
          const options = fallbackTransportOptions(leg.medium);
          const interaction = await transaction.interaction.create({
            data: {
              missionId: mission.id,
              sequence: nextSequence + 1,
              kind: 'TRANSPORT',
              status: 'RESOLVING',
              cellId: currentCellId,
              target: { type: 'CELL', cellId: movement.stop.cellId },
              blocking: true,
              situation: `The route enters ${leg.medium.toLowerCase()} terrain. Choose how to cross it.`,
              choices: [],
              transportOptions: options as Prisma.InputJsonValue,
            },
          });
          const dedupeKey = `transport:${interaction.id}`;
          await transaction.narrativeJob.upsert({
            where: { dedupeKey },
            update: {},
            create: {
              storyId: mission.storyId,
              kind: 'TRANSPORT',
              targetId: interaction.id,
              dedupeKey,
              input: { medium: leg.medium, terrainTags: [] },
            },
          });
        }
      } else if (!complete && !failed && movement.stop) {
        const isMissionDestination =
          currentCellId === mission.destinationCellId;
        const needsInteraction =
          movement.stop.kind === 'ENCOUNTER' ||
          movement.stop.kind === 'WAYPOINT' ||
          (movement.stop.kind === 'DESTINATION' &&
            mission.chapter.order === 3 &&
            isMissionDestination);
        if (needsInteraction) {
          const kind =
            movement.stop.kind === 'DESTINATION' &&
            mission.chapter.order === 3 &&
            isMissionDestination
              ? 'FINALE'
              : 'DISCOVERY';
          const dedupeKey = `interaction:${mission.id}:${currentCellId}:${kind}:${mission.version + 1}`;
          await transaction.narrativeJob.upsert({
            where: { dedupeKey },
            update: {},
            create: {
              storyId: mission.storyId,
              kind: 'INTERACTION',
              targetId: mission.id,
              dedupeKey,
              input: {
                cellId: currentCellId,
                kind,
                isFinale: kind === 'FINALE',
              },
            },
          });
        }
      }

      if (complete) await this.completeMission(transaction, mission);
    });
  }

  private async resolveInteraction(
    mission: Prisma.MissionGetPayload<{
      include: { chapter: true; story: true; interactions: true };
    }>,
    action: Extract<
      SubmitMissionAction['action'],
      { type: 'CHOOSE_INTERACTION' | 'FREE_TEXT' }
    >,
    expectedVersion: number,
  ) {
    const interaction = this.blockingInteraction(mission);
    if (
      !interaction ||
      interaction.kind === 'TRANSPORT' ||
      interaction.status !== 'READY'
    ) {
      throw new ApiError(409, 'No narrative interaction is waiting');
    }
    if (action.type === 'CHOOSE_INTERACTION') {
      const choices = InteractionChoiceSchema.array().parse(
        interaction.choices,
      );
      if (!choices.some((choice) => choice.id === action.choiceId)) {
        throw new ApiError(400, 'Unknown interaction choice');
      }
    }
    const dedupeKey = `action-resolution:${interaction.id}`;
    await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.mission.updateMany({
        where: { id: mission.id, version: expectedVersion },
        data: { version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        throw new ApiError(409, 'Mission state changed; refresh before acting');
      }
      await transaction.interaction.update({
        where: { id: interaction.id },
        data: {
          status: 'RESOLVING',
          playerAction: action as Prisma.InputJsonValue,
        },
      });
      await transaction.narrativeJob.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          storyId: mission.storyId,
          kind: 'ACTION_RESOLUTION',
          targetId: interaction.id,
          dedupeKey,
        },
      });
    });
  }

  private async retryMission(
    mission: Prisma.MissionGetPayload<{
      include: { chapter: true; story: true; interactions: true };
    }>,
    expectedVersion: number,
  ): Promise<string> {
    if (mission.status !== 'FAILED')
      throw new ApiError(409, 'Mission has not failed');
    const checkpoint = StoryStateSchema.parse(mission.chapter.checkpointState);
    const objectives = MissionObjectiveSchema.array()
      .parse(mission.objectives)
      .map((objective) => ({ ...objective, complete: false }));
    const retry = await this.prisma.$transaction(async (transaction) => {
      const claimed = await transaction.mission.updateMany({
        where: { id: mission.id, version: expectedVersion, status: 'FAILED' },
        data: { version: { increment: 1 } },
      });
      if (claimed.count !== 1) {
        throw new ApiError(409, 'Mission state changed; refresh before acting');
      }
      await transaction.story.update({
        where: { id: mission.storyId },
        data: { state: checkpoint as Prisma.InputJsonValue },
      });
      await transaction.chapter.update({
        where: { id: mission.chapterId },
        data: { status: 'ACTIVE', completedAt: null },
      });
      const retryMission = await transaction.mission.create({
        data: {
          storyId: mission.storyId,
          chapterId: mission.chapterId,
          retryOfMissionId: mission.id,
          attempt: mission.attempt + 1,
          title: mission.title,
          summary: mission.summary,
          status: 'ACTIVE',
          startCellId: mission.startCellId,
          destinationCellId: mission.destinationCellId,
          waypointCellIds: mission.waypointCellIds,
          encounterCellIds: mission.encounterCellIds,
          currentCellId: mission.startCellId,
          revealedCellIds: [mission.startCellId],
          objectives: objectives as Prisma.InputJsonValue,
          maxActions: mission.maxActions,
        },
      });
      const dedupeKey = `interaction:${retryMission.id}:${mission.startCellId}:DIALOGUE:initial`;
      await transaction.narrativeJob.upsert({
        where: { dedupeKey },
        update: {},
        create: {
          storyId: mission.storyId,
          kind: 'INTERACTION',
          targetId: retryMission.id,
          dedupeKey,
          input: {
            cellId: mission.startCellId,
            kind: 'DIALOGUE',
            isFinale: false,
          },
        },
      });
      return retryMission;
    });
    return retry.id;
  }

  private async completeMission(
    transaction: Prisma.TransactionClient,
    mission: Prisma.MissionGetPayload<{
      include: { chapter: true; story: true };
    }>,
  ) {
    await transaction.chapter.update({
      where: { id: mission.chapterId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
    if (mission.chapter.order === 3) {
      await transaction.story.update({
        where: { id: mission.storyId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          setupStatus: 'READY',
        },
      });
      return;
    }
    const nextChapter = await transaction.chapter.findUniqueOrThrow({
      where: {
        storyId_order: {
          storyId: mission.storyId,
          order: mission.chapter.order + 1,
        },
      },
    });
    const dedupeKey = `mission-setup:${nextChapter.id}:1`;
    await transaction.story.update({
      where: { id: mission.storyId },
      data: { setupStatus: 'GENERATING', setupError: null },
    });
    await transaction.narrativeJob.upsert({
      where: { dedupeKey },
      update: {},
      create: {
        storyId: mission.storyId,
        kind: 'MISSION_SETUP',
        targetId: nextChapter.id,
        dedupeKey,
      },
    });
  }

  private mapWorld(world: {
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
  }) {
    return {
      _id: world.id,
      version: world.version,
      name: world.name,
      description: world.description ?? undefined,
      theme: world.theme ?? undefined,
      contextWindowLimit: world.contextWindowLimit ?? undefined,
      mapImageUrl: world.mapImageUrl ?? undefined,
      settings: world.settings ?? undefined,
      lore: world.lore ?? undefined,
      createdAt: world.createdAt.toISOString(),
      updatedAt: world.updatedAt.toISOString(),
    };
  }

  private mapCharacter(character: {
    id: string;
    worldId: string;
    userId: string | null;
    name: string;
    description: string | null;
    biography: string | null;
    previewUrl: string | null;
    gallery: Prisma.JsonValue | null;
    promptHint: string | null;
    traits: string[];
    factionIds: string[];
    cultureIds: string[];
    speciesIds: string[];
    archetypeIds: string[];
    meta: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      _id: character.id,
      worldId: character.worldId,
      userId: character.userId ?? undefined,
      name: character.name,
      description: character.description ?? undefined,
      biography: character.biography ?? undefined,
      previewUrl: character.previewUrl ?? undefined,
      gallery: character.gallery ?? undefined,
      promptHint: character.promptHint ?? undefined,
      traits: character.traits,
      factionIds: character.factionIds,
      cultureIds: character.cultureIds,
      speciesIds: character.speciesIds,
      archetypeIds: character.archetypeIds,
      meta: character.meta ?? { descriptors: [] },
      createdAt: character.createdAt.toISOString(),
      updatedAt: character.updatedAt.toISOString(),
    };
  }
}

import { Prisma, PrismaClient } from '@prisma/client';
import {
  StartStorySchema,
  StoryOverviewSchema,
  type StartStoryInput,
  type StoryOverview,
} from '@talespin/schema';
import { ApiError } from './errors';
import { CharacterService } from './character.service';
import { WorldService } from './world.service';

const storySelect = {
  select: {
    id: true,
    worldId: true,
    startedByUserId: true,
    title: true,
    status: true,
    setupStatus: true,
    setupError: true,
    premise: true,
    state: true,
    startedAt: true,
    createdAt: true,
    updatedAt: true,
    completedAt: true,
    participants: {
      select: {
        id: true,
        storyId: true,
        userId: true,
        characterId: true,
        joinedAt: true,
      },
    },
  },
} as const;

type PrismaStory = Prisma.StoryGetPayload<typeof storySelect>;

const INITIAL_STORY_STATE = {
  knownFacts: [],
  consequences: [],
  unresolvedThreads: [],
  inventory: [],
  usedItemKeys: [],
  relationships: [],
  visitedCellIds: [],
  travelHistory: [],
};

export class StoryService {
  private readonly characters: CharacterService;
  private readonly worlds: WorldService;

  constructor(private prisma: PrismaClient) {
    this.characters = new CharacterService(prisma);
    this.worlds = new WorldService(prisma);
  }

  async getStoryForWorld(
    worldId: string,
    userId: string,
  ): Promise<StoryOverview | null> {
    const story = await this.prisma.story.findUnique({
      where: {
        worldId_startedByUserId: { worldId, startedByUserId: userId },
      },
      select: storySelect.select,
    });

    if (!story) return null;
    await this.ensureOutlineJob(story);
    return this.toOverview(story);
  }

  async getStory(storyId: string, userId: string): Promise<StoryOverview> {
    const story = await this.prisma.story.findFirst({
      where: {
        id: storyId,
        participants: { some: { userId } },
      },
      select: storySelect.select,
    });

    if (!story) {
      throw new ApiError(404, 'Story not found');
    }

    await this.ensureOutlineJob(story);
    return this.toOverview(story);
  }

  async startStory(
    worldId: string,
    userId: string,
    input: StartStoryInput,
  ): Promise<StoryOverview> {
    const { characterId } = StartStorySchema.parse(input);
    const [world, character] = await Promise.all([
      this.worlds.getWorld(worldId),
      this.characters.getCharacter(worldId, characterId),
    ]);

    if (character.userId && character.userId !== userId) {
      throw new ApiError(403, 'This character is not available to play');
    }

    const story = await this.prisma.story.upsert({
      where: {
        worldId_startedByUserId: { worldId, startedByUserId: userId },
      },
      update: {},
      create: {
        worldId,
        startedByUserId: userId,
        title: `${character.name} in ${world.name}`,
        status: 'ACTIVE',
        state: INITIAL_STORY_STATE,
        narrativeJobs: {
          create: {
            kind: 'OUTLINE',
            targetId: worldId,
            dedupeKey: `outline:${worldId}:${userId}`,
          },
        },
        participants: {
          create: { userId, characterId },
        },
      },
      select: storySelect.select,
    });

    await this.ensureOutlineJob(story);
    return this.toOverview(story);
  }

  private async ensureOutlineJob(story: PrismaStory) {
    if (story.setupStatus !== 'QUEUED') return;
    await this.prisma.narrativeJob.upsert({
      where: { dedupeKey: `outline:${story.worldId}:${story.startedByUserId}` },
      update: {},
      create: {
        storyId: story.id,
        kind: 'OUTLINE',
        targetId: story.worldId,
        dedupeKey: `outline:${story.worldId}:${story.startedByUserId}`,
      },
    });
  }

  private async toOverview(story: PrismaStory): Promise<StoryOverview> {
    const [world, participantCharacters] = await Promise.all([
      this.worlds.getWorld(story.worldId),
      Promise.all(
        story.participants.map((participant) =>
          this.characters.getCharacter(story.worldId, participant.characterId),
        ),
      ),
    ]);

    return StoryOverviewSchema.parse({
      _id: story.id,
      worldId: story.worldId,
      startedByUserId: story.startedByUserId,
      title: story.title,
      status: story.status,
      setupStatus: story.setupStatus,
      setupError: story.setupError,
      premise: story.premise,
      state: story.state,
      participants: story.participants.map((participant, index) => ({
        _id: participant.id,
        storyId: participant.storyId,
        userId: participant.userId,
        characterId: participant.characterId,
        joinedAt: participant.joinedAt.toISOString(),
        character: participantCharacters[index],
      })),
      world,
      startedAt: story.startedAt.toISOString(),
      createdAt: story.createdAt.toISOString(),
      updatedAt: story.updatedAt.toISOString(),
      completedAt: story.completedAt?.toISOString() ?? null,
    });
  }
}

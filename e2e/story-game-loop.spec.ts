import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { MissionPlayView, StoryPlayView } from '@talespin/schema';

const loadDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const source = readFileSync(
    path.join(process.cwd(), 'apps/worldbuilder/.env'),
    'utf8',
  );
  const match = source.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
  if (!match?.[1]) throw new Error('DATABASE_URL is missing for E2E setup.');
  return match[1];
};

process.env.DATABASE_URL = loadDatabaseUrl();
let prisma: (typeof import('../apps/worldbuilder/src/lib/prisma'))['prisma'];
const runId = process.env.E2E_RUN_ID ?? `${Date.now()}`;
const worldName = `E2E Story Crossing ${runId}`;
let worldId = '';
let protagonistId = '';
let worldGuideId = '';

const storyPath = (storyId: string) => `/api/explore/stories/${storyId}`;
const missionPath = (storyId: string, missionId: string) =>
  `${storyPath(storyId)}/missions/${missionId}`;

async function seedWorld() {
  const world = await prisma.world.create({
    data: {
      name: worldName,
      description:
        'A compact realm divided by a living river, built to verify an explorer Story from opening encounter to final choice.',
      theme: 'fantasy',
    },
  });
  worldId = world.id;
  const grid = await prisma.worldGrid.create({
    data: {
      worldId,
      width: 4,
      height: 4,
      homeCellId: '000000000000000000000001',
    },
  });
  const cells = [];
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      const water = x === 1;
      cells.push(
        await prisma.gridCell.create({
          data: {
            gridId: grid.id,
            x,
            y,
            walkable: water ? y % 2 === 0 : true,
            traversal: water
              ? {
                  medium: 'WATER',
                  difficulty: 2,
                  footAllowed: false,
                  tags: ['living-river'],
                }
              : {
                  medium: 'LAND',
                  difficulty: 1,
                  footAllowed: true,
                  tags: ['road'],
                },
            biome: water ? 'living river' : 'meadow road',
            name: water ? `River Reach ${y + 1}` : `Waystone ${x}-${y}`,
            description: water
              ? 'Deep enchanted water divides the realm.'
              : 'A weathered route through the grasslands.',
            tags: water ? ['river', 'enchanted-water'] : ['road'],
          },
        }),
      );
    }
  }
  await prisma.worldGrid.update({
    where: { id: grid.id },
    data: {
      homeCellId: cells.find((cell) => cell.x === 0 && cell.y === 0)!.id,
    },
  });
  const protagonist = await prisma.character.create({
    data: {
      worldId,
      name: 'Ilyra Vale',
      description: 'A patient cartographer who listens to impossible roads.',
      traits: ['curious', 'steadfast'],
      meta: { descriptors: [] },
    },
  });
  protagonistId = protagonist.id;
  const guide = await prisma.character.create({
    data: {
      worldId,
      name: 'Orin the Ferryman',
      description: 'A world-authored keeper of the living river.',
      traits: ['wry', 'observant'],
      meta: { descriptors: [] },
    },
  });
  worldGuideId = guide.id;
}

async function cleanupWorld() {
  if (!worldId) return;
  const stories = await prisma.story.findMany({
    where: { worldId },
    select: { id: true },
  });
  const storyIds = stories.map((story) => story.id);
  const missions = await prisma.mission.findMany({
    where: { storyId: { in: storyIds } },
    select: { id: true },
  });
  const missionIds = missions.map((mission) => mission.id);
  await prisma.missionAction.deleteMany({
    where: { missionId: { in: missionIds } },
  });
  await prisma.interaction.deleteMany({
    where: { missionId: { in: missionIds } },
  });
  await prisma.narrativeJob.deleteMany({
    where: { storyId: { in: storyIds } },
  });
  await prisma.mission.deleteMany({ where: { storyId: { in: storyIds } } });
  await prisma.chapter.deleteMany({ where: { storyId: { in: storyIds } } });
  await prisma.storyCharacter.deleteMany({
    where: { storyId: { in: storyIds } },
  });
  await prisma.storyParticipant.deleteMany({
    where: { storyId: { in: storyIds } },
  });
  await prisma.story.deleteMany({ where: { id: { in: storyIds } } });
  await prisma.character.deleteMany({ where: { worldId } });
  const grid = await prisma.worldGrid.findUnique({
    where: { worldId },
    select: { id: true },
  });
  if (grid) {
    await prisma.gridCell.deleteMany({ where: { gridId: grid.id } });
    await prisma.worldGrid.delete({ where: { id: grid.id } });
  }
  await prisma.world.deleteMany({ where: { id: worldId } });
}

async function getStory(page: Page, storyId: string) {
  const response = await page.request.get(storyPath(storyId));
  expect(response.status()).toBe(200);
  return (await response.json()) as StoryPlayView;
}

async function getMission(page: Page, storyId: string, missionId: string) {
  const response = await page.request.get(missionPath(storyId, missionId));
  expect(response.status()).toBe(200);
  return (await response.json()) as MissionPlayView;
}

async function submitAction(
  page: Page,
  storyId: string,
  mission: MissionPlayView,
  action: Record<string, unknown>,
) {
  const response = await page.request.post(
    `${missionPath(storyId, mission.mission._id)}/actions`,
    {
      data: {
        actionId: crypto.randomUUID(),
        expectedVersion: mission.mission.version,
        action,
      },
    },
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as MissionPlayView;
}

async function waitForMission(
  page: Page,
  storyId: string,
  missionId: string,
  predicate: (view: MissionPlayView) => boolean,
) {
  let latest: MissionPlayView | undefined;
  await expect
    .poll(
      async () => {
        latest = await getMission(page, storyId, missionId);
        return predicate(latest);
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return latest!;
}

async function waitForMissionProgressOrCompletion(
  page: Page,
  storyId: string,
  missionId: string,
  predicate: (view: MissionPlayView) => boolean,
) {
  let latest: MissionPlayView | null = null;
  let completed = false;
  await expect
    .poll(
      async () => {
        const response = await page.request.get(
          missionPath(storyId, missionId),
        );
        if (response.status() === 200) {
          latest = (await response.json()) as MissionPlayView;
          return predicate(latest);
        }
        if (response.status() === 404) {
          const persisted = await prisma.mission.findUnique({
            where: { id: missionId },
            select: { status: true },
          });
          completed = persisted?.status === 'SUCCESS';
          return completed;
        }
        expect(response.status()).toBe(200);
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return completed ? null : latest;
}

test.beforeAll(async () => {
  ({ prisma } = await import('../apps/worldbuilder/src/lib/prisma'));
  await seedWorld();
});
test.afterAll(async () => {
  await cleanupWorld();
  await prisma.$disconnect();
});

test('explorer completes three terrain-aware chapters and the selected finale', async ({
  page,
}) => {
  test.slow();
  await page.goto('/signin');
  await page.getByRole('button', { name: 'Continue with E2E account' }).click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toMatch(/^\/(?:choose-role)?$/);
  if (new URL(page.url()).pathname === '/choose-role') {
    await page.getByRole('button', { name: 'Start exploring' }).click();
    await page.waitForURL('/');
  }
  await page.goto('/');
  await page.getByRole('button', { name: 'Open explorer' }).click();
  await page.waitForURL('/explore');
  await expect(
    page.getByRole('heading', { name: 'Explore Worlds' }),
  ).toBeVisible();
  await page.getByText(worldName, { exact: true }).click();
  await page.waitForURL(new RegExp(`/explore/worlds/${worldId}/join`));
  await page.getByRole('button', { name: /Ilyra Vale/ }).click();
  await page.getByRole('button', { name: 'Start story' }).click();
  await page.waitForURL(/\/explore\/stories\//);
  const storyId = page.url().split('/').at(-1)!;

  let usedFreeText = false;
  let usedWaterCreature = false;
  let removedWorldGuide = false;
  const conclusionCells: string[] = [];

  for (let chapterOrder = 1; chapterOrder <= 3; chapterOrder += 1) {
    let story: StoryPlayView | undefined;
    await expect
      .poll(
        async () => {
          story = await getStory(page, storyId);
          return story.activeMissionId;
        },
        { timeout: 30_000 },
      )
      .toBeTruthy();
    const missionId = story!.activeMissionId!;
    await page.goto(`/explore/stories/${storyId}/missions/${missionId}`);
    await expect(page.getByText(worldName, { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: story!.title }),
    ).toBeVisible();
    await expect(
      page.getByText(`Chapter ${chapterOrder} of 3`, { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Journey history' }).click();
    const journeyHistory = page.getByRole('dialog', {
      name: 'Journey history',
    });
    await expect(journeyHistory).toBeVisible();
    await journeyHistory.getByRole('button', { name: 'Close' }).click();
    const travelCost = page.getByRole('progressbar', {
      name: 'Mission travel cost',
    });
    await expect(travelCost).toBeVisible();
    await expect(travelCost).toHaveAttribute('aria-valuemin', '0');
    await page.getByRole('button', { name: 'Mission details' }).click();
    const revealDestination = page.getByRole('button', {
      name: 'Reveal destination',
    });
    await expect(revealDestination).toHaveAttribute('aria-pressed', 'false');
    await revealDestination.click();
    const spoilerDialog = page
      .getByRole('dialog')
      .filter({ hasText: 'Reveal the Mission destination anyway?' });
    await expect(spoilerDialog).toBeVisible();
    await spoilerDialog.getByRole('button').last().click();
    await expect(
      page.getByTestId('destination-spoiler-highlight'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Mission details' }).click();
    const hideDestination = page.getByRole('button', {
      name: 'Hide destination',
    });
    await expect(hideDestination).toHaveAttribute('aria-pressed', 'true');
    await hideDestination.click();
    await expect(
      page.getByTestId('destination-spoiler-highlight'),
    ).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('dialog', { name: 'Mission details' }),
    ).toBeHidden();

    for (let step = 0; step < 40; step += 1) {
      let mission = await waitForMission(
        page,
        storyId,
        missionId,
        (view) => !view.generationPending,
      );
      if (mission.mission.status !== 'ACTIVE') {
        expect(mission.mission.status).toBe('SUCCESS');
        conclusionCells.push(mission.mission.currentCellId);
        break;
      }

      const interaction = mission.currentInteraction;
      if (interaction?.status === 'READY') {
        await expect(page.getByTestId('map-floating-dialog')).toBeVisible();
        await expect(
          page.getByRole('dialog', { name: 'Interaction' }),
        ).toBeVisible();
        await expect(
          page.getByText(interaction.situation, { exact: true }),
        ).toBeVisible();
        const previousVersion = mission.mission.version;
        if (interaction.kind === 'TRANSPORT') {
          const option =
            interaction.transportOptions.find(
              (candidate) => candidate.id === 'water-creature',
            ) ?? interaction.transportOptions[0]!;
          await page
            .getByRole('button', { name: new RegExp(option.name, 'i') })
            .click();
          if (option.id === 'water-creature') usedWaterCreature = true;
        } else if (chapterOrder === 2 && !usedFreeText) {
          await page
            .getByPlaceholder('Or describe what you do...')
            .fill('I listen carefully and ask what this clue changes.');
          await page.getByRole('button', { name: 'Submit action' }).click();
          usedFreeText = true;
        } else {
          await page
            .getByRole('button', { name: interaction.choices[0]!.label })
            .click();
        }
        const progressedMission = await waitForMissionProgressOrCompletion(
          page,
          storyId,
          missionId,
          (view) =>
            view.mission.version > previousVersion && !view.generationPending,
        );
        if (!progressedMission) {
          const completedMission = await prisma.mission.findUniqueOrThrow({
            where: { id: missionId },
          });
          expect(completedMission.status).toBe('SUCCESS');
          conclusionCells.push(completedMission.currentCellId);
          break;
        }
        mission = progressedMission;
        if (!removedWorldGuide && interaction.kind === 'DIALOGUE') {
          expect(interaction.target.type).toBe('WORLD_CHARACTER');
          await prisma.character.delete({ where: { id: worldGuideId } });
          removedWorldGuide = true;
        }
        continue;
      }

      if (!mission.mission.travelPlan) {
        mission = await submitAction(page, storyId, mission, {
          type: 'SET_DESTINATION',
          destinationCellId: mission.mission.destinationCellId,
        });
        expect(mission.mission.travelPlan?.pathCellIds.length).toBeGreaterThan(
          1,
        );
        await page.reload();
        continue;
      }

      const previousVersion = mission.mission.version;
      const startJourney = page.getByRole('button', {
        name: 'Start journey',
      });
      const pauseJourney = page.getByRole('button', {
        name: 'Pause journey',
      });
      await expect(startJourney.or(pauseJourney)).toBeVisible();
      if (await startJourney.isVisible()) {
        await startJourney.click();
        await expect(pauseJourney).toBeVisible();
      }
      const progressedMission = await waitForMissionProgressOrCompletion(
        page,
        storyId,
        missionId,
        (view) => view.mission.version > previousVersion,
      );
      if (!progressedMission) {
        const completedMission = await prisma.mission.findUniqueOrThrow({
          where: { id: missionId },
        });
        expect(completedMission.status).toBe('SUCCESS');
        conclusionCells.push(completedMission.currentCellId);
        break;
      }
    }

    if (chapterOrder < 3) {
      await page.goto(`/explore/stories/${storyId}`);
    }
  }

  const completed = await getStory(page, storyId);
  expect(completed.status).toBe('COMPLETED');
  expect(
    completed.chapters.every((chapter) => chapter.status === 'COMPLETED'),
  ).toBe(true);
  expect(new Set(conclusionCells).size).toBe(3);
  expect(usedFreeText).toBe(true);
  expect(usedWaterCreature).toBe(true);

  const persistedStory = await prisma.story.findUniqueOrThrow({
    where: { id: storyId },
  });
  const persistedInteractions = await prisma.interaction.findMany({
    where: { mission: { storyId } },
  });
  const persistedActions = await prisma.missionAction.findMany({
    where: { mission: { storyId } },
  });
  const continueTravelActions = persistedActions.filter(
    (action) =>
      (action.request as { type?: string } | null)?.type === 'CONTINUE_TRAVEL',
  );
  const movementInteractions = persistedInteractions.filter(
    (interaction) => interaction.kind === 'MOVEMENT',
  );
  expect(continueTravelActions).toHaveLength(movementInteractions.length);
  expect(
    continueTravelActions.every((action) => action.status === 'COMPLETED'),
  ).toBe(true);
  expect(
    movementInteractions.some(
      (interaction) => interaction.traversedCellIds.length > 0,
    ),
  ).toBe(true);
  expect(
    persistedInteractions.some(
      (interaction) =>
        interaction.kind === 'TRANSPORT' &&
        JSON.stringify(interaction.playerAction).includes('water-creature'),
    ),
  ).toBe(true);
  expect(
    persistedInteractions.some((interaction) => interaction.kind === 'FINALE'),
  ).toBe(true);
  expect(
    await prisma.storyCharacter.count({ where: { storyId } }),
  ).toBeGreaterThan(0);
  expect(persistedStory.completedAt).not.toBeNull();
  expect(protagonistId).toBeTruthy();
});

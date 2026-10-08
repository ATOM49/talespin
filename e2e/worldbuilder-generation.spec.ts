import { expect, test, type APIResponse, type Page } from '@playwright/test';

type GeneratedWorldResult = {
  world: {
    _id: string;
    name: string;
    description?: string;
    mapImageUrl?: string;
    lore?: { tagline: string; missionSeeds: string[] };
  };
  regions: Array<{
    _id: string;
    name: string;
    cellIds: string[];
    factionPresence: Array<{ factionId: string; rationale: string }>;
  }>;
  factions: Array<{ _id: string; name: string; previewUrl?: string }>;
  characters: Array<{
    _id: string;
    name: string;
    previewUrl?: string;
    biography?: string;
    factionIds: string[];
  }>;
};

const waitForGeneratedWorld = (page: Page): Promise<APIResponse> =>
  page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === 'POST' &&
        url.pathname === '/api/worlds/generate'
      );
    },
    { timeout: 12 * 60 * 1000 },
  );

test('builder creates a coherent living world from one short seed', async ({
  page,
}) => {
  test.slow();

  const suffix = process.env.E2E_RUN_ID ?? 'playwright';
  const worldName = `E2E Aetherfall ${suffix}`;
  let result: GeneratedWorldResult | undefined;

  try {
    await page.goto('/signin');
    await page
      .getByRole('button', { name: 'Continue with E2E account' })
      .click();
    await page.waitForURL(/\/choose-role(?:\?|$)/);

    await page.getByRole('button', { name: 'Start building' }).click();
    await page.waitForURL('/');
    await expect(
      page.getByRole('heading', { name: 'World Atlas' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'New World' }).click();
    await page.waitForURL('/worlds/new');
    await expect(
      page.getByRole('heading', { name: 'Create a living world' }),
    ).toBeVisible();

    await page.getByLabel('World name').fill(worldName);
    await page
      .getByLabel('The setting')
      .fill(
        'A floating archipelago rides on sleeping giants while rival lighthouse guilds predict which island will wake next.',
      );

    const responsePromise = waitForGeneratedWorld(page);
    await page.getByRole('button', { name: 'Create living world' }).click();
    await expect(page.getByText('Server working').first()).toBeVisible();

    const response = await responsePromise;
    expect(response.status()).toBe(201);
    result = (await response.json()) as GeneratedWorldResult;

    expect(result.world.name).toBe(worldName);
    expect(result.world.description?.length).toBeGreaterThan(120);
    expect(result.world.mapImageUrl).toMatch(
      /^http:\/\/localhost:9000\/images\//,
    );
    expect(result.world.lore?.missionSeeds.length).toBeGreaterThanOrEqual(3);
    expect(result.regions).toHaveLength(5);
    expect(result.factions).toHaveLength(3);
    expect(result.characters).toHaveLength(3);
    expect(
      result.regions.reduce(
        (count, region) => count + region.cellIds.length,
        0,
      ),
    ).toBe(64);
    expect(
      result.regions.every((region) => region.factionPresence.length > 0),
    ).toBe(true);
    expect(
      result.characters.every(
        (character) =>
          Boolean(character.biography) && character.factionIds.length === 1,
      ),
    ).toBe(true);

    await page.waitForURL(`/worlds/${result.world._id}/regions`);
    await expect(
      page.getByRole('heading', { name: result.world.name }),
    ).toBeVisible();

    const firstRegion = result.regions[0]!;
    await expect(
      page.getByRole('heading', { name: firstRegion.name }),
    ).toBeVisible();
    await expect(
      page.getByRole('img', {
        name: `Map detail showing ${firstRegion.name} in ${result.world.name}`,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(firstRegion.factionPresence[0]!.rationale),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Factions' }).click();
    await expect(
      page.getByText(result.factions[0]!.name, { exact: true }),
    ).toBeVisible();

    await page.getByRole('tab', { name: 'Characters' }).click();
    await expect(
      page.getByText(result.characters[0]!.name, { exact: true }),
    ).toBeVisible();
  } finally {
    if (result?.world._id) {
      await page.request.delete(`/api/worlds/${result.world._id}`);
    }
  }
});

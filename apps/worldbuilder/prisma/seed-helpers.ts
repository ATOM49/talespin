import { PrismaClient } from '@prisma/client';
import type { FactionForm, WorldForm } from '@talespin/schema';

const WATCHER_API_URL = process.env.WATCHER_API_URL || 'http://localhost:4000';

/**
 * Generate a world map image via the watcher API
 */
export async function generateWorldMap(
  worldData: WorldForm,
): Promise<string | undefined> {
  try {
    console.log('🎨 Generating map image via DALL-E...');

    const response = await fetch(`${WATCHER_API_URL}/generate/map`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(worldData),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`⚠️  Image generation failed: ${error}`);
      return undefined;
    }

    const result = await response.json();
    console.log(`✅ Map image generated: ${result.imageUrl}`);
    return result.imageUrl;
  } catch (error) {
    console.error(`⚠️  Failed to connect to watcher API: ${error}`);
    console.log('⏭️  Continuing without generated map image...');
    return undefined;
  }
}

/**
 * Generate a faction preview image via the watcher API
 */
export async function generateFactionImage(
  factionData: Omit<FactionForm, 'previewUrl'>,
): Promise<string | undefined> {
  try {
    console.log(`   🎨 Generating preview image for ${factionData.name}...`);

    const response = await fetch(`${WATCHER_API_URL}/generate/faction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: factionData.name,
        category: factionData.category,
        summary: factionData.summary,
        description: factionData.description,
        tone: factionData.meta?.tone,
        keywords: factionData.meta?.keywords,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(
        `   ⚠️  Image generation failed for ${factionData.name}: ${error}`,
      );
      return undefined;
    }

    const result = await response.json();
    console.log(`   ✅ Preview image generated: ${result.imageUrl}`);
    return result.imageUrl;
  } catch (error) {
    console.error(
      `   ⚠️  Failed to generate image for ${factionData.name}: ${error}`,
    );
    return undefined;
  }
}

/**
 * Clear all data from the database in correct dependency order
 */
export async function clearDatabase(prisma: PrismaClient) {
  console.log('🗑️  Clearing existing database...');

  await prisma.character.deleteMany({});
  console.log('   Cleared characters');

  await prisma.faction.deleteMany({});
  console.log('   Cleared factions');

  await prisma.relationship.deleteMany({});
  console.log('   Cleared relationships');

  await prisma.entity.deleteMany({});
  console.log('   Cleared entities');

  await prisma.location.deleteMany({});
  console.log('   Cleared locations');

  await prisma.treasureHuntEvent.deleteMany({});
  console.log('   Cleared treasure hunt events');

  await prisma.treasureHuntRun.deleteMany({});
  console.log('   Cleared treasure hunt runs');

  await prisma.playerWorldExploration.deleteMany({});
  console.log('   Cleared player world explorations');

  await prisma.treasureHuntConfig.deleteMany({});
  console.log('   Cleared treasure hunt configs');

  await prisma.gridCell.deleteMany({});
  console.log('   Cleared grid cells');

  await prisma.worldGrid.deleteMany({});
  console.log('   Cleared world grids');

  await prisma.world.deleteMany({});
  console.log('   Cleared worlds');

  await prisma.player.deleteMany({});
  console.log('   Cleared players');

  console.log('✅ Database cleared\n');
}

/**
 * Seed factions for a given world
 */
export async function seedFactions(
  prisma: PrismaClient,
  worldId: string,
  factionData: Array<Omit<FactionForm, 'previewUrl'>>,
  mode: 'create' | 'upsert' = 'create',
) {
  console.log('\n🏰 Seeding factions...');

  const results = [];

  for (const data of factionData) {
    if (mode === 'upsert') {
      const existing = await prisma.faction.findFirst({
        where: {
          worldId,
          name: data.name,
        },
      });

      if (existing) {
        console.log(`⏭️  Skipping existing faction: ${data.name}`);
        results.push(existing);
        continue;
      }
    }

    // Generate preview image
    const previewUrl = await generateFactionImage(data);

    const faction = await prisma.faction.create({
      data: {
        ...data,
        worldId,
        previewUrl: previewUrl || null,
      },
    });

    console.log(
      `✅ Created: ${faction.name}${previewUrl ? ' (with preview image)' : ''}`,
    );
    results.push(faction);
  }

  console.log(`\n✅ Created ${results.length} factions`);
  return results;
}

/**
 * Get a world by ID or return the first world
 */
export async function getWorldOrFirst(prisma: PrismaClient, worldId?: string) {
  if (worldId) {
    const world = await prisma.world.findUnique({ where: { id: worldId } });
    if (!world) {
      throw new Error(`World with ID ${worldId} not found.`);
    }
    return world;
  }

  const worlds = await prisma.world.findMany({ take: 1 });
  if (worlds.length === 0) {
    throw new Error(
      'No worlds found. Please create a world first or run the main seed script.',
    );
  }

  return worlds[0];
}

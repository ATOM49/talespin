import { settleGeneration } from '../services/generation-recovery.js';
import type { FastifyInstance } from 'fastify';
import { cropImageByNormalizedBounds } from '@talespin/cdn';
import {
  EnhancedWorldContextSchema,
  GeneratedCharacterBatchSchema,
  GeneratedFactionBatchSchema,
  GeneratedRegionAssignmentBatchSchema,
  GeneratedRegionNarrativeSchema,
  GeneratedRegionSchema,
  RegionVisualPlanSchema,
  WorldBlueprintSchema,
  WorldCreationSeedSchema,
  type EnhancedWorldContext,
  type GeneratedCharacter,
  type GeneratedFaction,
  type GeneratedRegion,
  type GeneratedRegionAssignment,
  type ParsedWorldCreationSeed,
  type WorldBlueprint,
  type WorldCreationSeed,
} from '@talespin/models';
import {
  createMultimodalStructuredOutputModel,
  createStructuredOutputModel,
} from '../config/models.js';
import { enhanceWorldPrompt } from '../prompts/enhance-world.js';
import { worldMapPrompt } from '../prompts/world-map.js';
import { planMapRegionsPrompt } from '../prompts/plan-map-regions.js';
import { enrichRegionPrompt } from '../prompts/enrich-region.js';
import { generateWorldFactionsPrompt } from '../prompts/generate-world-factions.js';
import { generateFactionCharactersPrompt } from '../prompts/generate-faction-characters.js';
import { assignWorldFactionsPrompt } from '../prompts/assign-world-factions.js';
import {
  buildCharacterImagePrompt,
  buildFactionImagePrompt,
} from '../prompts/world-assets.js';
import { mapWithConcurrency } from '../utils/concurrency.js';
import {
  assertCompleteRegionCoverage,
  partitionGridByAnchors,
} from '../utils/world-regions.js';

const GRID_WIDTH = 8;
const GRID_HEIGHT = 8;
const TEXT_CONCURRENCY = 3;
const IMAGE_CONCURRENCY = 2;

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || 'world';

const contextForPrompt = (context: EnhancedWorldContext) =>
  JSON.stringify(context, null, 2);

const fetchImageBuffer = async (imageUrl: string) => {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(
      `Unable to read generated map image (${response.status} ${response.statusText})`,
    );
  }
  return Buffer.from(await response.arrayBuffer());
};

const assertUniqueKeys = (label: string, values: Array<{ key: string }>) => {
  const keys = new Set(values.map((value) => value.key));
  if (keys.size !== values.length) {
    throw new Error(`${label} must use unique temporary keys`);
  }
};

const assertBlueprintReferences = (blueprint: WorldBlueprint) => {
  assertUniqueKeys('Regions', blueprint.regions);
  assertUniqueKeys('Factions', blueprint.factions);
  assertUniqueKeys('Characters', blueprint.characters);
  assertCompleteRegionCoverage(blueprint.regions, GRID_WIDTH, GRID_HEIGHT);

  const regionKeys = new Set(blueprint.regions.map((region) => region.key));
  const factionKeys = new Set(blueprint.factions.map((faction) => faction.key));
  const assignedRegionKeys = new Set<string>();

  blueprint.characters.forEach((character) => {
    if (!factionKeys.has(character.factionKey)) {
      throw new Error(
        `Character ${character.key} references unknown faction ${character.factionKey}`,
      );
    }
  });

  blueprint.assignments.forEach((assignment) => {
    if (!regionKeys.has(assignment.regionKey)) {
      throw new Error(
        `Assignment references unknown region ${assignment.regionKey}`,
      );
    }
    if (assignedRegionKeys.has(assignment.regionKey)) {
      throw new Error(
        `Region ${assignment.regionKey} is assigned more than once`,
      );
    }
    assignedRegionKeys.add(assignment.regionKey);
    assignment.factions.forEach(({ factionKey }) => {
      if (!factionKeys.has(factionKey)) {
        throw new Error(`Assignment references unknown faction ${factionKey}`);
      }
    });
  });

  if (assignedRegionKeys.size !== regionKeys.size) {
    throw new Error('Every generated region must receive a faction assignment');
  }
};

const enhanceWorld = async (seed: ParsedWorldCreationSeed) => {
  const prompt = await enhanceWorldPrompt.format({
    name: seed.name ?? 'Let the setting suggest an original name',
    theme: seed.theme,
    description: seed.description,
  });
  const model = createStructuredOutputModel<EnhancedWorldContext>();
  const { structuredResponse } = await model.invoke({
    prompt,
    schema: EnhancedWorldContextSchema,
    temperature: 0.75,
  });
  return EnhancedWorldContextSchema.parse(structuredResponse);
};

const generateFactions = async (
  context: EnhancedWorldContext,
  count: number,
) => {
  const schema = GeneratedFactionBatchSchema.refine(
    (result) => result.factions.length === count,
    `Generate exactly ${count} factions`,
  ).refine(
    (result) =>
      new Set(result.factions.map((faction) => faction.key)).size ===
      result.factions.length,
    'Faction keys must be unique',
  );
  const prompt = await generateWorldFactionsPrompt.format({
    factionCount: count,
    worldContext: contextForPrompt(context),
  });
  const model =
    createStructuredOutputModel<GeneratedFactionBatchSchemaOutput>();
  const { structuredResponse } = await model.invoke({
    prompt,
    schema,
    temperature: 0.78,
  });
  const factions = schema.parse(structuredResponse).factions;
  assertUniqueKeys('Factions', factions);
  return factions;
};

type GeneratedFactionBatchSchemaOutput = {
  factions: GeneratedFaction[];
};

const generateMapAndRegions = async (
  fastify: FastifyInstance,
  context: EnhancedWorldContext,
  regionCount: number,
) => {
  const mapPrompt = await worldMapPrompt.format({
    name: context.name,
    theme: context.theme,
    description: context.description,
    tone: context.lore.tone,
    visualStyle: context.lore.visualStyle,
    currentTensions: context.lore.currentTensions.join('; '),
  });
  const worldSlug = slugify(context.name);
  const { url: mapImageUrl } = await fastify.imageGen.generateImageToCdn({
    prompt: mapPrompt,
    keyPrefix: `worlds/${worldSlug}/map/`,
    purpose: 'map',
    size: '1024x1024',
  });
  const originalMapBuffer = await fetchImageBuffer(mapImageUrl);
  const mapBuffer = await cropImageByNormalizedBounds(originalMapBuffer, {
    x: 0,
    y: 0,
    width: 1,
    height: 1,
  });

  const visualPlanSchema = RegionVisualPlanSchema.refine(
    (result) => result.regions.length === regionCount,
    `Identify exactly ${regionCount} regions`,
  ).refine(
    (result) =>
      new Set(result.regions.map((region) => region.key)).size ===
      result.regions.length,
    'Region keys must be unique',
  );
  const planPrompt = await planMapRegionsPrompt.format({
    regionCount,
    worldContext: contextForPrompt(context),
  });
  const visionModel = createMultimodalStructuredOutputModel<{
    regions: Array<{
      key: string;
      name: string;
      anchor: { x: number; y: number };
      visualSummary: string;
    }>;
  }>();
  const { structuredResponse: rawPlan } = await visionModel.invoke({
    text: planPrompt,
    image: {
      type: 'base64',
      data: mapBuffer.toString('base64'),
      mediaType: 'image/png',
    },
    schema: visualPlanSchema,
    temperature: 0.35,
  });
  const visualPlan = visualPlanSchema.parse(rawPlan);
  assertUniqueKeys('Regions', visualPlan.regions);

  const partitions = partitionGridByAnchors(
    visualPlan.regions,
    GRID_WIDTH,
    GRID_HEIGHT,
  );

  const regions = await mapWithConcurrency(
    partitions,
    TEXT_CONCURRENCY,
    async ({ seed, cellCoordinates, mapBounds }) => {
      const crop = await cropImageByNormalizedBounds(mapBuffer, mapBounds);
      const prompt = await enrichRegionPrompt.format({
        regionName: seed.name,
        worldContext: contextForPrompt(context),
        visualSummary: seed.visualSummary,
      });
      const model =
        createMultimodalStructuredOutputModel<GeneratedRegionNarrativeSchemaOutput>();
      const { structuredResponse } = await model.invoke({
        text: prompt,
        image: {
          type: 'base64',
          data: crop.toString('base64'),
          mediaType: 'image/png',
        },
        schema: GeneratedRegionNarrativeSchema,
        temperature: 0.68,
      });

      return GeneratedRegionSchema.parse({
        key: seed.key,
        ...GeneratedRegionNarrativeSchema.parse(structuredResponse),
        mapBounds,
        cellCoordinates,
      });
    },
  );

  assertCompleteRegionCoverage(regions, GRID_WIDTH, GRID_HEIGHT);
  return { mapImageUrl, regions };
};

type GeneratedRegionNarrativeSchemaOutput = {
  name: string;
  summary: string;
  description: string;
  biome: string;
  atmosphere: string;
  visualDetails: string[];
  missionHooks: string[];
};

const generateCharacters = async (
  context: EnhancedWorldContext,
  factions: GeneratedFaction[],
  charactersPerFaction: number,
) => {
  const batches = await mapWithConcurrency(
    factions,
    TEXT_CONCURRENCY,
    async (faction, factionIndex) => {
      const schema = GeneratedCharacterBatchSchema.refine(
        (result) => result.characters.length === charactersPerFaction,
        `Generate exactly ${charactersPerFaction} characters`,
      )
        .refine(
          (result) =>
            result.characters.every(
              (character) => character.factionKey === faction.key,
            ),
          'Characters must retain the required faction key',
        )
        .refine(
          (result) =>
            new Set(result.characters.map((character) => character.key))
              .size === result.characters.length,
          'Character keys must be unique within a faction',
        );
      const prompt = await generateFactionCharactersPrompt.format({
        characterCount: charactersPerFaction,
        worldContext: contextForPrompt(context),
        faction: JSON.stringify(faction, null, 2),
      });
      const model = createStructuredOutputModel<{
        characters: GeneratedCharacter[];
      }>();
      const { structuredResponse } = await model.invoke({
        prompt,
        schema,
        temperature: 0.76,
      });
      const characters = schema.parse(structuredResponse).characters;
      characters.forEach((character) => {
        if (character.factionKey !== faction.key) {
          throw new Error(
            `Character ${character.key} changed its required faction key`,
          );
        }
      });
      return characters.map((character) => ({
        ...character,
        key: `faction-${factionIndex}-${character.key}`,
      }));
    },
  );

  const characters = batches.flat();
  assertUniqueKeys('Characters', characters);
  return characters;
};

const assignFactions = async (
  context: EnhancedWorldContext,
  regions: GeneratedRegion[],
  factions: GeneratedFaction[],
): Promise<GeneratedRegionAssignment[]> => {
  const schema = GeneratedRegionAssignmentBatchSchema.refine(
    (result) => result.assignments.length === regions.length,
    'Return exactly one assignment for every region',
  ).refine((result) => {
    const keys = result.assignments.map((assignment) => assignment.regionKey);
    return (
      new Set(keys).size === regions.length &&
      keys.every((key) => regions.some((region) => region.key === key)) &&
      result.assignments.every((assignment) =>
        assignment.factions.every((presence) =>
          factions.some((faction) => faction.key === presence.factionKey),
        ),
      )
    );
  }, 'Assignments must reference each region once and only known factions');
  const prompt = await assignWorldFactionsPrompt.format({
    worldContext: contextForPrompt(context),
    regions: JSON.stringify(regions, null, 2),
    factions: JSON.stringify(factions, null, 2),
  });
  const model = createStructuredOutputModel<{
    assignments: GeneratedRegionAssignment[];
  }>();
  const { structuredResponse } = await model.invoke({
    prompt,
    schema,
    temperature: 0.45,
  });
  return schema.parse(structuredResponse).assignments;
};

const generateFactionImages = async (
  fastify: FastifyInstance,
  context: EnhancedWorldContext,
  factions: GeneratedFaction[],
) => {
  const worldSlug = slugify(context.name);
  return mapWithConcurrency(factions, IMAGE_CONCURRENCY, async (faction) => {
    const { url } = await fastify.imageGen.generateImageToCdn({
      prompt: buildFactionImagePrompt(context, faction),
      keyPrefix: `worlds/${worldSlug}/factions/${faction.key}/`,
      purpose: 'faction',
      size: '1024x1024',
    });
    return {
      ...faction,
      faction: { ...faction.faction, previewUrl: url },
    };
  });
};

const generateCharacterImages = async (
  fastify: FastifyInstance,
  context: EnhancedWorldContext,
  characters: GeneratedCharacter[],
  factions: GeneratedFaction[],
) => {
  const worldSlug = slugify(context.name);
  const factionByKey = new Map(
    factions.map((faction) => [faction.key, faction]),
  );
  return mapWithConcurrency(
    characters,
    IMAGE_CONCURRENCY,
    async (character) => {
      const faction = factionByKey.get(character.factionKey);
      if (!faction) {
        throw new Error(
          `Character ${character.key} references missing faction ${character.factionKey}`,
        );
      }
      const { url } = await fastify.imageGen.generateImageToCdn({
        prompt: buildCharacterImagePrompt(context, character, faction),
        keyPrefix: `worlds/${worldSlug}/characters/${character.key}/`,
        purpose: 'character',
        size: '1024x1024',
      });
      return { ...character, previewUrl: url };
    },
  );
};

export const createWorldBlueprintFunction =
  (fastify: FastifyInstance) =>
  async (input: WorldCreationSeed): Promise<WorldBlueprint> => {
    const seed = WorldCreationSeedSchema.parse(input);
    const context = await enhanceWorld(seed);

    const [{ mapImageUrl, regions }, generatedFactions] =
      await settleGeneration([
        generateMapAndRegions(fastify, context, seed.regionCount),
        generateFactions(context, seed.factionCount),
      ]);

    const generatedCharactersPromise = generateCharacters(
      context,
      generatedFactions,
      seed.charactersPerFaction,
    );
    const assignmentsPromise = assignFactions(
      context,
      regions,
      generatedFactions,
    );
    const factionsPromise = generateFactionImages(
      fastify,
      context,
      generatedFactions,
    );
    const charactersPromise = generatedCharactersPromise.then((characters) =>
      generateCharacterImages(fastify, context, characters, generatedFactions),
    );

    const [assignments, factions, characters] = await settleGeneration([
      assignmentsPromise,
      factionsPromise,
      charactersPromise,
    ]);

    const blueprint = WorldBlueprintSchema.parse({
      context,
      mapImageUrl,
      regions,
      factions,
      characters,
      assignments,
    });
    assertBlueprintReferences(blueprint);

    fastify.log.info({
      msg: 'Generated coherent world blueprint',
      world: context.name,
      regionCount: regions.length,
      factionCount: factions.length,
      characterCount: characters.length,
    });

    return blueprint;
  };

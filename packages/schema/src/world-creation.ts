import { z } from 'zod';
import {
  CharacterDescriptorSchema,
  CharacterMetaSchema,
  CharacterSchema,
} from './character';
import { FactionFormSchema, FactionSchema } from './faction';
import {
  GridCoordinateSchema,
  MapBoundsSchema,
  RegionInfluenceSchema,
  RegionSchema,
} from './region';
import { WorldLoreSchema, WorldSchema, WorldThemeSchema } from './world';

export const WorldCreationSeedSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  theme: WorldThemeSchema,
  description: z
    .string()
    .trim()
    .min(12, 'Give Talespin at least a sentence to build from.')
    .max(1200),
  regionCount: z.number().int().min(4).max(6).default(5),
  factionCount: z.number().int().min(3).max(5).default(3),
  charactersPerFaction: z.number().int().min(1).max(2).default(1),
});

export const EnhancedWorldContextSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(120),
  theme: WorldThemeSchema,
  lore: WorldLoreSchema,
});

export const RegionVisualSeedSchema = z.object({
  key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  anchor: GridCoordinateSchema.extend({
    x: z.number().int().min(0).max(7),
    y: z.number().int().min(0).max(7),
  }),
  visualSummary: z.string().min(1),
});

export const RegionVisualPlanSchema = z.object({
  regions: z.array(RegionVisualSeedSchema).min(4).max(6),
});

export const GeneratedRegionNarrativeSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().min(1),
  biome: z.string().min(1),
  atmosphere: z.string().min(1),
  visualDetails: z.array(z.string().min(1)).min(2),
  missionHooks: z.array(z.string().min(1)).min(2),
});

export const GeneratedRegionSchema = GeneratedRegionNarrativeSchema.extend({
  key: RegionVisualSeedSchema.shape.key,
  mapBounds: MapBoundsSchema,
  cellCoordinates: z.array(GridCoordinateSchema).min(1),
});

export const GeneratedFactionDraftSchema = z.object({
  key: RegionVisualSeedSchema.shape.key,
  faction: FactionFormSchema.omit({ previewUrl: true }).extend({
    category: z.literal('faction'),
  }),
});

export const GeneratedFactionBatchSchema = z.object({
  factions: z.array(GeneratedFactionDraftSchema).min(3).max(5),
});

export const GeneratedCharacterDraftSchema = z.object({
  key: RegionVisualSeedSchema.shape.key,
  factionKey: RegionVisualSeedSchema.shape.key,
  name: z.string().min(1),
  description: z.string().min(1),
  biography: z.string().min(1),
  promptHint: z.string().min(1),
  traits: z.array(z.string().min(1)).min(2),
  meta: CharacterMetaSchema.extend({
    descriptors: z.array(CharacterDescriptorSchema).min(2),
    notes: z.string().min(1),
  }),
});

export const GeneratedCharacterSchema = GeneratedCharacterDraftSchema.extend({
  previewUrl: z.string().url().optional(),
});

export const GeneratedCharacterBatchSchema = z.object({
  characters: z.array(GeneratedCharacterDraftSchema).min(1).max(2),
});

export const GeneratedFactionSchema = GeneratedFactionDraftSchema.extend({
  faction: GeneratedFactionDraftSchema.shape.faction.extend({
    previewUrl: z.string().url().optional(),
  }),
});

export const GeneratedRegionAssignmentSchema = z.object({
  regionKey: RegionVisualSeedSchema.shape.key,
  factions: z
    .array(
      z.object({
        factionKey: RegionVisualSeedSchema.shape.key,
        influence: RegionInfluenceSchema,
        rationale: z.string().min(1),
      }),
    )
    .min(1)
    .max(2),
});

export const GeneratedRegionAssignmentBatchSchema = z.object({
  assignments: z.array(GeneratedRegionAssignmentSchema).min(1),
});

export const WorldBlueprintSchema = z.object({
  context: EnhancedWorldContextSchema,
  mapImageUrl: z.string().url(),
  regions: z.array(GeneratedRegionSchema).min(4).max(6),
  factions: z.array(GeneratedFactionSchema).min(3).max(5),
  characters: z.array(GeneratedCharacterSchema).min(3),
  assignments: z.array(GeneratedRegionAssignmentSchema).min(4),
});

export const WorldCreationResultSchema = z.object({
  world: WorldSchema,
  regions: z.array(RegionSchema),
  factions: z.array(FactionSchema),
  characters: z.array(CharacterSchema),
});

export const WorldGenerationJobStatusSchema = z.enum([
  'QUEUED',
  'GENERATING',
  'PERSISTING',
  'COMPLETED',
  'FAILED',
]);

export const WorldGenerationJobResultSchema = z.object({
  worldId: z.string().min(1),
  regions: z.number().int().nonnegative(),
  factions: z.number().int().nonnegative(),
  characters: z.number().int().nonnegative(),
});

export const WorldGenerationJobSchema = z.object({
  jobId: z.string().min(1),
  status: WorldGenerationJobStatusSchema,
  seed: WorldCreationSeedSchema,
  attempt: z.number().int().nonnegative(),
  retryable: z.boolean(),
  blueprintAvailable: z.boolean(),
  error: z.string().optional(),
  result: WorldGenerationJobResultSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type WorldCreationSeed = z.input<typeof WorldCreationSeedSchema>;
export type ParsedWorldCreationSeed = z.output<typeof WorldCreationSeedSchema>;
export type EnhancedWorldContext = z.infer<typeof EnhancedWorldContextSchema>;
export type RegionVisualSeed = z.infer<typeof RegionVisualSeedSchema>;
export type GeneratedRegion = z.infer<typeof GeneratedRegionSchema>;
export type GeneratedFaction = z.infer<typeof GeneratedFactionSchema>;
export type GeneratedCharacter = z.infer<typeof GeneratedCharacterSchema>;
export type GeneratedRegionAssignment = z.infer<
  typeof GeneratedRegionAssignmentSchema
>;
export type WorldBlueprint = z.infer<typeof WorldBlueprintSchema>;
export type WorldCreationResult = z.infer<typeof WorldCreationResultSchema>;
export type WorldGenerationJobStatus = z.infer<
  typeof WorldGenerationJobStatusSchema
>;
export type WorldGenerationJobResult = z.infer<
  typeof WorldGenerationJobResultSchema
>;
export type WorldGenerationJob = z.infer<typeof WorldGenerationJobSchema>;

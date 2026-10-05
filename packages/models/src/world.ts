import { z } from 'zod';
import { Id } from './common';

export const WorldThemeSchema = z.enum([
  'fantasy',
  'sci‑fi',
  'modern',
  'historical',
  'post‑apocalyptic',
]);

export const WorldLoreSchema = z.object({
  tagline: z.string().min(1),
  tone: z.string().min(1),
  visualStyle: z.string().min(1),
  history: z.string().min(1),
  currentTensions: z.array(z.string().min(1)).min(2),
  gameplayPillars: z.array(z.string().min(1)).min(2),
  missionSeeds: z.array(z.string().min(1)).min(3),
});

export const WorldBaseSchema = z.object({
  name: z.string().min(1, 'Name must not be empty'),
  description: z.string().optional(),
  theme: WorldThemeSchema.optional(),
  contextWindowLimit: z.coerce
    .number()
    .int('Context window limit must be an integer')
    .min(256, 'Context window must be at least 256 tokens')
    .max(4096, 'Context window cannot exceed 4096 tokens')
    .optional(),
  version: z.number().int().default(1),
  mapImageUrl: z
    .string()
    .url()
    .optional()
    .describe('URL of the world map image'),
  settings: z
    .record(z.string(), z.any())
    .optional()
    .describe('Additional world settings'),
  lore: WorldLoreSchema.optional().describe(
    'Generated context used to keep regions, factions, characters, and missions coherent.',
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const WorldFormSchema = WorldBaseSchema.omit({
  version: true,
  createdAt: true,
  updatedAt: true,
});

export const WorldSchema = WorldBaseSchema.extend({
  _id: Id,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type World = z.infer<typeof WorldSchema>;
export type WorldForm = z.infer<typeof WorldFormSchema>;
export type WorldLore = z.infer<typeof WorldLoreSchema>;
export type WorldTheme = z.infer<typeof WorldThemeSchema>;

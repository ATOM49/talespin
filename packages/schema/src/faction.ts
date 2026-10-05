import { z } from 'zod';
import { Id } from './common';

export const FactionCategorySchema = z
  .enum(['faction', 'culture', 'species', 'entity', 'archetype'])
  .describe(
    'Determines whether this entry represents a faction, culture, species, entity collective, or loose archetype.',
  );

export const FactionCharacterHookSchema = z
  .object({
    title: z
      .string()
      .min(1)
      .describe('Short, evocative label for a sample member concept.'),
    description: z
      .string()
      .min(1)
      .describe(
        'One to two sentences describing how the member behaves or looks.',
      ),
  })
  .describe(
    'Reusable snippets that help spawn characters tied to this faction.',
  );

export const FactionMetaSchema = z
  .object({
    tone: z
      .string()
      .default('')
      .describe(
        'High-level vibe or mood cues for narrative and prompt generation.',
      ),
    keywords: z
      .array(z.string())
      .default([])
      .describe(
        'Searchable keywords that summarize beliefs, aesthetics, or tactics.',
      ),
    characterHooks: z
      .array(FactionCharacterHookSchema)
      .default([])
      .describe(
        'Curated hooks that document potential characters within the group.',
      ),
  })
  .describe('Structured metadata that accelerates AI generation and UI copy.');

export const FactionBaseSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe('Unique display name of the faction, culture, or species.'),
  summary: z
    .string()
    .default('')
    .describe('One-line teaser that appears in cards and listings.'),
  description: z
    .string()
    .default('')
    .describe(
      'Long-form description covering politics, customs, or hierarchy.',
    ),
  previewUrl: z
    .string()
    .default('')
    .describe('CDN URL pointing to an AI generated emblem or banner.'),
  category: FactionCategorySchema,
  meta: FactionMetaSchema,
});

export const FactionFormSchema = FactionBaseSchema.extend({
  previewUrl: z
    .string()
    .optional()
    .describe(
      'Optional CDN URL for an existing emblem or banner. Leave blank to generate one.',
    ),
});

export const FactionSchema = FactionBaseSchema.extend({
  _id: Id,
  worldId: Id,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Faction = z.infer<typeof FactionSchema>;
export type FactionForm = z.infer<typeof FactionFormSchema>;

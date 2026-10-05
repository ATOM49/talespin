import { z } from 'zod';
import { Id } from './common';

export const CharacterGroupSchema = z.object({
  name: z.string().min(1),
  summary: z.string().optional(),
});

export const CharacterImageRequestSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  biography: z.string().optional(),
  factions: z.array(CharacterGroupSchema).default([]),
  cultures: z.array(CharacterGroupSchema).default([]),
  species: z.array(CharacterGroupSchema).default([]),
  archetypes: z.array(CharacterGroupSchema).default([]),
  traits: z.array(z.string()).default([]),
  promptHint: z.string().optional(),
});

export const CharacterGalleryImageSchema = z
  .object({
    angle: z
      .string()
      .min(1)
      .describe('Label for the camera angle such as front, rear, or profile.'),
    description: z
      .string()
      .optional()
      .describe(
        'Short summary of the pose, wardrobe focus, or lighting for this shot.',
      ),
    imageUrl: z
      .string()
      .url()
      .describe('CDN URL for this render of the character.'),
    revisedPrompt: z
      .string()
      .optional()
      .describe(
        'Model-authored prompt returned by the generator, useful for reruns.',
      ),
  })
  .describe('Single render inside a multi-angle character concept sheet.');

export const CharacterGallerySchema = z
  .array(CharacterGalleryImageSchema)
  .describe(
    'Ordered list of multi-angle renders that make up the character gallery.',
  );

export const CharacterProfileRequestSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe('Name supplied by the builder to seed an auto-generated NPC.'),
  description: z
    .string()
    .optional()
    .describe('Short pitch or hook captured from user input.'),
  species: z
    .array(CharacterGroupSchema)
    .default([])
    .describe('Species or entity notes that anchor the generation process.'),
});

export const CharacterDescriptorSchema = z
  .object({
    label: z
      .string()
      .min(1)
      .describe(
        'Short descriptor title such as demeanor, secret, or specialty.',
      ),
    detail: z
      .string()
      .min(1)
      .describe('Sentence that elaborates on the descriptor for storytelling.'),
  })
  .describe('Reusable text blocks that flesh out a named character.');

export const CharacterMetaSchema = z
  .object({
    descriptors: z
      .array(CharacterDescriptorSchema)
      .default([])
      .describe('Narrative descriptors surfaced in UI cards and AI prompts.'),
    notes: z
      .string()
      .optional()
      .describe('Internal notes that help narrators improvise scenes.'),
  })
  .describe('Structured metadata that keeps improvised NPCs consistent.');

export const CharacterBaseSchema = z.object({
  name: z
    .string()
    .min(1)
    .describe('Unique name for the character, e.g., “Magical Elf Maya”.'),
  description: z
    .string()
    .optional()
    .describe('Short elevator pitch that introduces the character.'),
  biography: z
    .string()
    .optional()
    .describe('Long-form biography or GM notes about motivations and arcs.'),
  previewUrl: z
    .string()
    .url()
    .optional()
    .describe('AI generated portrait stored on the CDN.'),
  gallery: CharacterGallerySchema.default([]).describe(
    'Multi-angle renders for the character concept sheet ordered as generated.',
  ),
  promptHint: z
    .string()
    .optional()
    .describe(
      'Optional direct instruction used when generating a new portrait.',
    ),
  traits: z
    .array(z.string())
    .default([])
    .describe('Free-form tags that make filtering NPCs easier.'),
  factionIds: z
    .array(Id)
    .default([])
    .describe(
      'References to faction or culture entries that this character serves.',
    ),
  cultureIds: z
    .array(Id)
    .default([])
    .describe(
      'References to cultural groups that shape customs, dialects, or behavior.',
    ),
  speciesIds: z
    .array(Id)
    .default([])
    .describe(
      'References to species or entity archetypes applicable to the character.',
    ),
  archetypeIds: z
    .array(Id)
    .default([])
    .describe(
      'Additional archetype IDs (professions, cultists, etc.) to reuse across hunts.',
    ),
  meta: CharacterMetaSchema,
});

export const CharacterCreationSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .describe('Unique name captured during quick character creation.'),
    description: z
      .string()
      .optional()
      .describe('Optional short hook entered by the user.'),
    speciesIds: z
      .array(Id)
      .min(1, 'Select at least one species to ground the concept.')
      .describe('Selected species or entity IDs used for synthesis.'),
  })
  .describe('Minimal payload collected from the builder prior to synthesis.');

export const PlayerCharacterCreationSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
  })
  .describe(
    'Player-authored character input that can start a Story without provider-backed generation.',
  );

export const CharacterGeneratedDetailsSchema = z
  .object({
    biography: z
      .string()
      .min(1)
      .describe('Narrative-ready biography produced by the AI chain.'),
    promptHint: z
      .string()
      .default('')
      .describe('Optional directive that guides downstream art generation.'),
    traits: z
      .array(z.string())
      .default([])
      .describe('Tagged list of personality or visual traits.'),
    meta: z
      .object({
        descriptors: z
          .array(CharacterDescriptorSchema)
          .default([])
          .describe(
            'Narrative descriptors surfaced in UI cards and AI prompts.',
          ),
        notes: z
          .string()
          .default('')
          .describe('Internal notes that help narrators improvise scenes.'),
      })
      .describe('Structured metadata that keeps improvised NPCs consistent.'),
  })
  .describe('AI-authored structured details merged into the final character.');

export const CharacterFormSchema = CharacterBaseSchema;

export const CharacterSchema = CharacterBaseSchema.extend({
  _id: Id,
  worldId: Id,
  userId: Id.optional().describe(
    'Owner user id for player-controlled characters.',
  ),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Character = z.infer<typeof CharacterSchema>;
export type CharacterForm = z.infer<typeof CharacterFormSchema>;
export type CharacterGalleryImage = z.infer<typeof CharacterGalleryImageSchema>;
export type CharacterGroup = z.infer<typeof CharacterGroupSchema>;
export type CharacterImageRequestInput = z.infer<
  typeof CharacterImageRequestSchema
>;
export type CharacterProfileRequestInput = z.infer<
  typeof CharacterProfileRequestSchema
>;
export type CharacterCreationInput = z.infer<typeof CharacterCreationSchema>;
export type PlayerCharacterCreationInput = z.infer<
  typeof PlayerCharacterCreationSchema
>;
export type CharacterGeneratedDetails = z.infer<
  typeof CharacterGeneratedDetailsSchema
>;

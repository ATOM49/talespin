import { z } from 'zod';
import { WorldFormSchema } from './world.js';
import {
  WorldBlueprintSchema,
  WorldCreationSeedSchema,
} from './world-creation.js';
import { FactionFormSchema } from './faction.js';
import {
  CharacterGeneratedDetailsSchema,
  CharacterGalleryImageSchema,
  CharacterImageRequestSchema,
  CharacterProfileRequestSchema,
} from './character.js';
import {
  NarrativeGenerationRequestSchema,
  NarrativeGenerationResponseSchema,
} from './narrative.js';

export const GenerationIdSchema = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);
export const MapImageRequestSchema = WorldFormSchema;
export const ImageGenerationResponseSchema = z.object({
  imageUrl: z.string().url(),
  revisedPrompt: z.string().optional(),
});
export const FactionImageRequestSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().optional(),
  description: z.string().optional(),
  tone: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  promptHint: z.string().optional(),
});
export const CharacterGenerationResponseSchema = z.object({
  profile: CharacterGeneratedDetailsSchema,
  gallery: z.array(CharacterGalleryImageSchema).min(1),
  coverImage: z.string().url(),
  revisedPrompt: z.string().optional(),
});
export const CharacterGalleryResponseSchema = z.object({
  imageUrl: z.string().url(),
  images: z.array(CharacterGalleryImageSchema).min(1),
  revisedPrompt: z.string().optional(),
});
export const EditImageRequestSchema = z
  .object({
    prompt: z.string().min(1),
    imageUrl: z.string().url().optional(),
    imageBase64: z.string().min(1).optional(),
    polygon: z.object({
      points: z
        .array(
          z.object({
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
          }),
        )
        .min(3),
    }),
    size: z.enum(['256x256', '512x512', '1024x1024']).default('1024x1024'),
    keyPrefix: z.string().default('edits/'),
    featherPx: z.number().min(0).max(100).optional(),
    dilatePx: z.number().min(0).max(100).optional(),
  })
  .refine(
    (data) => Boolean(data.imageUrl || data.imageBase64),
    'Provide either imageUrl or imageBase64',
  );
export const EditImageResponseSchema = z.object({
  imageUrl: z.string().url(),
  key: z.string(),
  meta: z.object({
    provider: z.string(),
    model: z.string(),
    size: z.string(),
    requestId: z.string().optional(),
  }),
});

/** The wire contract, shared by the service and its server-side client. */
export const WatcherContracts = {
  '/generate/map': {
    request: MapImageRequestSchema,
    response: ImageGenerationResponseSchema,
  },
  '/generate/faction': {
    request: FactionImageRequestSchema,
    response: ImageGenerationResponseSchema,
  },
  '/generate/faction-details': {
    request: WorldFormSchema,
    response: FactionFormSchema,
  },
  '/generate/character': {
    request: CharacterProfileRequestSchema,
    response: CharacterGenerationResponseSchema,
  },
  '/generate/character-gallery': {
    request: CharacterImageRequestSchema,
    response: CharacterGalleryResponseSchema,
  },
  '/generate/edit-image': {
    request: EditImageRequestSchema,
    response: EditImageResponseSchema,
  },
  '/generate/world-blueprint': {
    request: WorldCreationSeedSchema,
    response: WorldBlueprintSchema,
  },
  '/generate/narrative': {
    request: NarrativeGenerationRequestSchema,
    response: NarrativeGenerationResponseSchema,
  },
} as const;
export type WatcherEndpoint = keyof typeof WatcherContracts;
export type WatcherInput<E extends WatcherEndpoint> = z.input<
  (typeof WatcherContracts)[E]['request']
>;
export type WatcherOutput<E extends WatcherEndpoint> = z.output<
  (typeof WatcherContracts)[E]['response']
>;
export type EditImageRequestInput = z.input<typeof EditImageRequestSchema>;
export type EditImageResponse = z.infer<typeof EditImageResponseSchema>;
export type FactionImageRequestInput = z.input<
  typeof FactionImageRequestSchema
>;

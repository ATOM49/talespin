import { FastifyInstance } from 'fastify';
import {
  CharacterGeneratedDetailsSchema,
  CharacterGallerySchema,
  CharacterProfileRequestSchema,
  type CharacterProfileRequestInput,
  type CharacterGeneratedDetails,
  type CharacterGalleryImage,
} from '@talespin/schema';
import { characterPromptTemplate } from '../prompts/characterPrompt.js';
import { createCharacterProfileChain } from './generateCharacterProfile.js';
import { createCharacterGalleryChain } from './generateCharacterGallery.js';

const formatGroups = (groups: CharacterProfileRequestInput['species']) => {
  if (!groups || groups.length === 0) {
    return 'None provided';
  }

  return groups
    .map((group) =>
      group.summary ? `${group.name}: ${group.summary}` : group.name,
    )
    .join('; ');
};

const formatList = (items: string[]) => {
  if (!items || items.length === 0) {
    return 'None provided';
  }

  return items.join(', ');
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || 'character';

interface CharacterGenerationResult {
  profile: CharacterGeneratedDetails;
  gallery: CharacterGalleryImage[];
}

export const createGenerateCharacterFunction = (fastify: FastifyInstance) => {
  const profileChain = createCharacterProfileChain();
  const galleryChain = createCharacterGalleryChain(fastify);

  return async (
    input: CharacterProfileRequestInput,
  ): Promise<CharacterGenerationResult> => {
    const request = CharacterProfileRequestSchema.parse(input);

    const rawProfile = await profileChain.invoke(request);
    const profile = CharacterGeneratedDetailsSchema.parse(rawProfile);

    const characterBrief = await characterPromptTemplate.format({
      name: request.name,
      description: request.description ?? '–',
      biography: profile.biography,
      factions: 'None provided',
      species: formatGroups(request.species),
      archetypes: 'None provided',
      traits: formatList(profile.traits),
      promptHint:
        profile.promptHint ??
        'Use the Talespin high-fidelity cinematic pixel-art house style.',
    });

    const slug = slugify(request.name);
    const { images } = await galleryChain.invoke({ characterBrief, slug });

    const gallery = CharacterGallerySchema.parse(images);

    if (!gallery.length) {
      throw new Error('No gallery images generated for character');
    }

    fastify.log.info({
      msg: 'Generated character profile and gallery',
      name: request.name,
      gallerySize: gallery.length,
    });

    return { profile, gallery };
  };
};

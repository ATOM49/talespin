import type { FastifyPluginAsync } from 'fastify';
import {
  CharacterImageRequestSchema,
  type WatcherInput,
} from '@talespin/models';
import { createCharacterGalleryChain } from '../../chains/generateCharacterGallery.js';
import { characterPromptTemplate } from '../../prompts/characterPrompt.js';

const characterGallery: FastifyPluginAsync = async (fastify) => {
  const generate = createCharacterGalleryChain(fastify);
  fastify.post<{ Body: WatcherInput<'/generate/character-gallery'> }>(
    '/',
    async (request) => {
      const input = CharacterImageRequestSchema.parse(request.body);
      const groups = (items: Array<{ name: string; summary?: string }>) =>
        items
          .map((item) =>
            item.summary ? `${item.name}: ${item.summary}` : item.name,
          )
          .join('; ') || 'None provided';
      const characterBrief = await characterPromptTemplate.format({
        name: input.name,
        description: input.description ?? '–',
        biography: input.biography ?? '–',
        factions: groups([...input.factions, ...input.cultures]),
        species: groups(input.species),
        archetypes: groups(input.archetypes),
        traits: input.traits.join(', ') || 'None provided',
        promptHint:
          input.promptHint ??
          'Use the Talespin cinematic pixel-art house style.',
      });
      const slug =
        input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'character';
      const { images } = await generate.invoke({ characterBrief, slug });
      return {
        imageUrl: images[0].imageUrl,
        images,
        revisedPrompt: images[0].revisedPrompt,
      };
    },
  );
};
export default characterGallery;

import { FastifyPluginAsync } from 'fastify';
import {
  CharacterProfileRequestSchema,
  type CharacterProfileRequestInput,
  type WatcherOutput,
} from '@talespin/schema';
import { createGenerateCharacterFunction } from '../../chains/generateCharacter.js';

type CharacterGenerationResponse = WatcherOutput<'/generate/character'>;

interface ErrorResponse {
  error: string;
  details?: string;
}

const generateCharacter: FastifyPluginAsync = async (fastify) => {
  const generateCharacterFlow = createGenerateCharacterFunction(fastify);

  fastify.post<{
    Body: CharacterProfileRequestInput;
    Reply: CharacterGenerationResponse | ErrorResponse;
  }>('/', async (req, reply) => {
    const startTime = Date.now();

    try {
      const parsed = CharacterProfileRequestSchema.safeParse(req.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: 'Invalid character payload',
          details: JSON.stringify(parsed.error.flatten().fieldErrors),
        });
      }

      const result = await generateCharacterFlow(parsed.data);
      const coverImage = result.gallery[0]?.imageUrl;
      const revisedPrompt = result.gallery[0]?.revisedPrompt;

      if (!coverImage) {
        return reply.status(500).send({
          error: 'Invalid response from image generation service',
          details: 'No primary image was returned by the gallery chain',
        });
      }

      const duration = Date.now() - startTime;
      fastify.log.info({
        msg: 'Character generated',
        duration,
        coverImage,
        imageCount: result.gallery.length,
      });

      return reply.send({
        profile: result.profile,
        gallery: result.gallery,
        coverImage,
        revisedPrompt,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      fastify.log.error({
        msg: 'Failed to generate character',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return reply.status(500).send({
        error: 'Failed to generate character',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default generateCharacter;

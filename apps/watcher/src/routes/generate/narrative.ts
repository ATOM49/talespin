import type { FastifyPluginAsync } from 'fastify';
import {
  NarrativeGenerationRequestSchema,
  NarrativeGenerationResponseSchema,
  type NarrativeGenerationRequest,
  type NarrativeGenerationResponse,
} from '@talespin/schema';
import { createNarrativeGenerationFunction } from '../../chains/generateNarrative.js';

const narrativeRoute: FastifyPluginAsync = async (fastify) => {
  const generate = createNarrativeGenerationFunction();

  fastify.post<{
    Body: NarrativeGenerationRequest;
    Reply: NarrativeGenerationResponse | { error: string; details?: string };
  }>('/', async (request, reply) => {
    const parsed = NarrativeGenerationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid narrative generation request',
        details: JSON.stringify(parsed.error.flatten().fieldErrors),
      });
    }

    try {
      return reply.send(
        NarrativeGenerationResponseSchema.parse(await generate(parsed.data)),
      );
    } catch (error) {
      fastify.log.error({
        msg: 'Narrative generation failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return reply.status(500).send({ error: 'Narrative generation failed' });
    }
  });
};

export default narrativeRoute;

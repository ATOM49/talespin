import type { FastifyPluginAsync } from 'fastify';
import {
  WorldBlueprintSchema,
  WorldCreationSeedSchema,
  type WorldBlueprint,
  type WorldCreationSeed,
} from '@talespin/schema';
import { createWorldBlueprintFunction } from '../../chains/createWorldBlueprint.js';

type ErrorResponse = { error: string; details?: string };

const generateWorldBlueprint: FastifyPluginAsync = async (fastify) => {
  const createBlueprint = createWorldBlueprintFunction(fastify);

  fastify.post<{
    Body: WorldCreationSeed;
    Reply: WorldBlueprint | ErrorResponse;
  }>('/', async (request, reply) => {
    const startedAt = Date.now();
    const parsed = WorldCreationSeedSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid world seed',
        details: JSON.stringify(parsed.error.flatten().fieldErrors),
      });
    }

    try {
      const blueprint = WorldBlueprintSchema.parse(
        await createBlueprint(parsed.data),
      );
      fastify.log.info({
        msg: 'World blueprint request completed',
        world: blueprint.context.name,
        duration: Date.now() - startedAt,
      });
      return reply.send(blueprint);
    } catch (error) {
      fastify.log.error({
        msg: 'World blueprint generation failed',
        duration: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      return reply.status(500).send({
        error: 'Failed to generate world blueprint',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default generateWorldBlueprint;

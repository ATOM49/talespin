import { FastifyPluginAsync } from 'fastify';
import { mapPromptTemplate } from '../../prompts/generate-map.js';
import { type WatcherInput, type WatcherOutput } from '@talespin/schema';

type GenerateMapResponse = WatcherOutput<'/generate/map'>;
interface ErrorResponse {
  error: string;
  details?: string;
}

const generateMap: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: WatcherInput<'/generate/map'>;
    Reply: GenerateMapResponse | ErrorResponse;
  }>('/', async (req, reply) => {
    const startTime = Date.now();

    try {
      const world = req.body;

      // Validate required fields
      if (!world.name) {
        return reply.status(400).send({
          error: 'Missing required fields',
          details: 'World name is required',
        });
      }

      fastify.log.info({
        msg: 'Starting map generation',
        world: { name: world.name },
      });

      const prompt = await mapPromptTemplate.format({
        name: world.name,
        description: world.description ?? '–',
        settings: world.settings ?? '–',
      });

      fastify.log.debug({
        msg: 'Generated map image prompt',
        prompt: prompt.substring(0, 200), // Log first 200 chars
      });

      // Use shared image generation plugin (uploads to CDN/MinIO)
      let imageUrl: string;
      try {
        const slug = world.name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        const res = await fastify.imageGen.generateImageToCdn({
          prompt,
          keyPrefix: `maps/${slug}/`,
          purpose: 'map',
          size: '1024x1024',
        });
        imageUrl = res.url;
      } catch (upstreamError) {
        fastify.log.error({
          msg: 'Image provider error',
          error: upstreamError,
        });

        // Handle specific upstream provider/CDN errors
        if (upstreamError instanceof Error) {
          if (upstreamError.message.toLowerCase().includes('rate limit')) {
            return reply.status(429).send({
              error: 'Rate limit exceeded',
              details: 'Too many requests to image generation service',
            });
          }
          if (upstreamError.message.toLowerCase().includes('timeout')) {
            return reply.status(504).send({
              error: 'Request timeout',
              details: 'Image generation took too long',
            });
          }
          if (
            upstreamError.message.includes('content policy') ||
            upstreamError.message.includes('safety')
          ) {
            return reply.status(400).send({
              error: 'Content policy violation',
              details: 'The provided content was rejected by safety filters',
            });
          }
        }

        throw upstreamError;
      }

      // Validate the generated URL
      if (!imageUrl || typeof imageUrl !== 'string') {
        fastify.log.error({
          msg: 'Invalid image URL received',
          imageUrl,
        });
        return reply.status(500).send({
          error: 'Invalid response from image generation service',
          details: 'No valid image URL was generated',
        });
      }

      const duration = Date.now() - startTime;
      fastify.log.info({
        msg: 'Map generation completed',
        duration,
        imageUrl,
      });

      reply.send({
        imageUrl,
        revisedPrompt: undefined,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      fastify.log.error({
        msg: 'Failed to generate map image',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return reply.status(500).send({
        error: 'Failed to generate map image',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default generateMap;

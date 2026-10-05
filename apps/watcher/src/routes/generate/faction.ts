import { FastifyPluginAsync } from 'fastify';
import { factionPromptTemplate } from '../../prompts/generate-faction.js';

import { type WatcherInput, type WatcherOutput } from '@talespin/models';
type FactionImageRequestBody = WatcherInput<'/generate/faction'>;
type FactionImageResponse = WatcherOutput<'/generate/faction'>;

interface ErrorResponse {
  error: string;
  details?: string;
}

const formatList = (items?: string[]) => {
  if (!items || items.length === 0) return 'None provided';
  return items.join(', ');
};

const generateFaction: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: FactionImageRequestBody;
    Reply: FactionImageResponse | ErrorResponse;
  }>('/', async (req, reply) => {
    const startTime = Date.now();

    try {
      const { name, category } = req.body;
      if (!name?.trim()) {
        return reply.status(400).send({
          error: 'Missing required fields',
          details: 'name is required to build a faction prompt',
        });
      }

      const keywordsText = formatList(req.body.keywords);

      const prompt = await factionPromptTemplate.format({
        name,
        category,
        summary: req.body.summary ?? '–',
        description: req.body.description ?? '–',
        tone: req.body.tone ?? '–',
        keywords: keywordsText,
        promptHint:
          req.body.promptHint ??
          'Use the Talespin high-fidelity cinematic pixel-art house style.',
      });

      let imageUrl: string;
      let revisedPrompt: string | undefined;

      try {
        const slug = name
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '');

        const result = await fastify.imageGen.generateImageToCdn({
          prompt,
          keyPrefix: `factions/${slug}/`,
          purpose: 'faction',
        });
        imageUrl = result.url;
        revisedPrompt = result.revisedPrompt;
      } catch (upstreamError) {
        fastify.log.error({
          msg: 'Image provider error while generating faction image',
          error: upstreamError,
        });

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

      if (!imageUrl) {
        fastify.log.error({
          msg: 'Invalid image URL received from faction generation',
          imageUrl,
        });
        return reply.status(500).send({
          error: 'Invalid response from image generation service',
          details: 'No valid image URL was generated',
        });
      }

      const duration = Date.now() - startTime;
      fastify.log.info({
        msg: 'Faction image generated',
        duration,
        imageUrl,
      });

      return reply.send({ imageUrl, revisedPrompt });
    } catch (error) {
      const duration = Date.now() - startTime;
      fastify.log.error({
        msg: 'Failed to generate faction image',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return reply.status(500).send({
        error: 'Failed to generate faction image',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default generateFaction;

import { FastifyPluginAsync } from 'fastify';
import { buildInpaintMaskPNG } from '@talespin/cdn';

import {
  type EditImageRequestInput,
  type EditImageResponse,
} from '@talespin/schema';
type EditImageRequestBody = EditImageRequestInput;

interface ErrorResponse {
  error: string;
  details?: string;
}

const editImage: FastifyPluginAsync = async (fastify) => {
  fastify.post<{
    Body: EditImageRequestBody;
    Reply: EditImageResponse | ErrorResponse;
  }>('/', async (req, reply) => {
    const startTime = Date.now();

    try {
      const {
        prompt,
        imageBase64,
        imageUrl,
        polygon,
        size,
        keyPrefix,
        featherPx,
        dilatePx,
      } = req.body;

      // Validate required fields
      if (!prompt || !polygon) {
        return reply.status(400).send({
          error: 'Missing required fields',
          details: 'prompt and polygon are required',
        });
      }

      if (!imageBase64 && !imageUrl) {
        return reply.status(400).send({
          error: 'Missing image data',
          details: 'Provide either imageBase64 or imageUrl',
        });
      }

      fastify.log.info({
        msg: 'Starting image edit operation',
        polygon,
        size: size || '1024x1024',
      });

      // Load source image
      let imageBuffer: Buffer;
      if (imageBase64) {
        imageBuffer = Buffer.from(imageBase64, 'base64');
        fastify.log.debug({
          msg: 'Converted base64 to buffer',
          size: imageBuffer.length,
        });
      } else if (imageUrl) {
        fastify.log.debug({
          msg: 'Fetching source image URL',
          imageUrl,
        });
        try {
          const imageResponse = await fetch(imageUrl);
          if (!imageResponse.ok) {
            fastify.log.error({
              msg: 'Failed to fetch source image',
              status: imageResponse.status,
              statusText: imageResponse.statusText,
            });
            return reply.status(502).send({
              error: 'Failed to fetch source image',
              details: `Unable to download image (${imageResponse.status})`,
            });
          }
          const arrayBuffer = await imageResponse.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
          fastify.log.debug({
            msg: 'Fetched source image buffer',
            size: imageBuffer.length,
          });
        } catch (fetchError) {
          fastify.log.error({
            msg: 'Error fetching source image',
            error: fetchError,
            imageUrl,
          });
          return reply.status(502).send({
            error: 'Failed to fetch source image',
            details:
              fetchError instanceof Error
                ? fetchError.message
                : 'Unknown error',
          });
        }
      } else {
        return reply.status(400).send({
          error: 'Missing image data',
          details: 'Provide either imageBase64 or imageUrl',
        });
      }

      // Generate inpaint mask from polygon
      const maskBuffer = await buildInpaintMaskPNG({
        imageBuffer,
        polygon,
        featherPx,
        dilatePx,
      });

      fastify.log.debug({
        msg: 'Generated inpaint mask',
        size: maskBuffer.length,
      });

      // Use image generation plugin to edit image
      let result;
      try {
        result = await fastify.imageGen.editImageToCdn({
          prompt,
          image: imageBuffer,
          mask: maskBuffer,
          size: size || '1024x1024',
          keyPrefix: keyPrefix || 'edits/',
        });
      } catch (upstreamError) {
        fastify.log.error({
          msg: 'Image editing provider error',
          error: upstreamError,
        });

        // Handle specific upstream errors
        if (upstreamError instanceof Error) {
          if (upstreamError.message.toLowerCase().includes('rate limit')) {
            return reply.status(429).send({
              error: 'Rate limit exceeded',
              details: 'Too many requests to image editing service',
            });
          }
          if (upstreamError.message.toLowerCase().includes('timeout')) {
            return reply.status(504).send({
              error: 'Request timeout',
              details: 'Image editing took too long',
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
      if (!result.url || typeof result.url !== 'string') {
        fastify.log.error({
          msg: 'Invalid image URL received',
          result,
        });
        return reply.status(500).send({
          error: 'Invalid response from image editing service',
          details: 'No valid image URL was generated',
        });
      }

      const duration = Date.now() - startTime;
      fastify.log.info({
        msg: 'Image edit completed',
        duration,
        imageUrl: result.url,
      });

      reply.send({
        imageUrl: result.url,
        key: result.key,
        meta: result.meta,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      fastify.log.error({
        msg: 'Failed to edit image',
        duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      return reply.status(500).send({
        error: 'Failed to edit image',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
};

export default editImage;

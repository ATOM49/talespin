/**
 * Image Generation Plugin
 *
 * Provides provider-neutral image generation and editing with CDN persistence.
 *
 * Features:
 * - generateImageToCdn: Select a model by asset purpose and cache the result
 * - editImageToCdn: Edit existing images using the configured editing provider
 *
 * Dependencies:
 * - @talespin/ai: provider model adapters
 * - @talespin/cdn: MinIO client for CDN uploads
 * - cdn plugin must be registered before this plugin
 *
 * @module image-generation
 */
import { File as NodeFile } from 'node:buffer';
import fp from 'fastify-plugin';
import type {} from './cdn.js';
import type { MinioClientInstance } from '@talespin/cdn';
import type {
  ImageEditModel,
  ImageGenerationModel,
  ImageGenerationSize,
} from '@talespin/ai';
import {
  assertAIImageConfigured,
  assertAIModelConfigured,
  loadAIConfig,
  missingSegmindAdapterError,
  type ImagePurpose,
} from '../config/ai.js';
import {
  recoverGeneration,
  generationFingerprint,
  type ProviderRecovery,
} from '../services/generation-recovery.js';
import { createImageCacheFingerprint } from '../utils/image-cache.js';

export type ImageGenOptions = {
  defaultSize?: '1024x1024' | '1792x1024' | '1024x1792';
};

const ensureTrailingSlash = (prefix: string): string =>
  prefix.endsWith('/') ? prefix : `${prefix}/`;

declare module 'fastify' {
  interface FastifyInstance {
    imageGen: {
      /**
       * Generate an image from a text prompt and upload to CDN.
       * Caches by provider, model, purpose, prompt, and requested size.
       *
       * @param prompt - The text prompt for image generation
       * @param keyPrefix - CDN storage prefix (e.g., 'maps/world-name/' or 'characters/hero/')
       * @param size - Image dimensions
       */
      generateImageToCdn: (args: {
        prompt: string;
        keyPrefix: string;
        purpose: ImagePurpose;
        size?: ImageGenerationSize;
      }) => Promise<{ url: string; key: string; revisedPrompt?: string }>;
      editImageToCdn: (args: {
        prompt: string;
        image: Buffer;
        mask: Buffer;
        keyPrefix?: string;
        size?: '256x256' | '512x512' | '1024x1024';
      }) => Promise<{
        url: string;
        key: string;
        meta: {
          provider: string;
          model: string;
          size: string;
          requestId?: string;
        };
      }>;
    };
  }
}

type AIModule = typeof import('@talespin/ai');

let aiModulePromise: Promise<AIModule> | undefined;

const loadAiModule = () => {
  aiModulePromise ??= import('@talespin/ai');
  return aiModulePromise;
};

// Ensure File global exists for OpenAI SDKs that expect browser File objects
if (typeof globalThis.File === 'undefined') {
  (globalThis as typeof globalThis & { File: typeof NodeFile }).File = NodeFile;
}

export default fp<ImageGenOptions>(
  async (fastify, opts) => {
    const defaultSize = opts.defaultSize || '1024x1024';

    // Wait for CDN plugin to be registered
    if (!fastify.cdn) {
      throw new Error('CDN plugin must be registered before image-generation');
    }

    const cdnClient: MinioClientInstance = fastify.cdn;

    const ai = await loadAiModule();
    const aiConfig = loadAIConfig();
    assertAIImageConfigured(aiConfig.image);

    let imageGenerateModels: Record<ImagePurpose, ImageGenerationModel>;
    if (aiConfig.image.provider === 'segmind') {
      const client = new ai.SegmindClient({ apiKey: aiConfig.image.apiKey });
      imageGenerateModels = {
        map: ai.createNanoBananaProImageModel({
          client,
          model: aiConfig.image.models.map,
          version: 'v2',
        }),
        character: ai.createSeedreamImageModel({
          client,
          model: aiConfig.image.models.character,
          version: 'v2',
        }),
        faction: ai.createIdeogramImageModel({
          client,
          model: aiConfig.image.models.faction,
          version: 'v2',
        }),
      };
    } else {
      const openAIImageModel = new ai.OpenAIImageGenerateRunnable({
        apiKey: aiConfig.image.apiKey,
        model: aiConfig.image.models.map,
      });
      imageGenerateModels = {
        map: openAIImageModel,
        character: openAIImageModel,
        faction: openAIImageModel,
      };
    }

    let imageEditModel: ImageEditModel | undefined;
    const getImageEditModel = (): ImageEditModel => {
      if (imageEditModel) return imageEditModel;

      const config = aiConfig.imageEdit;
      assertAIModelConfigured('imageEdit', config);
      if (config.provider === 'segmind') {
        throw missingSegmindAdapterError('imageEdit', config);
      }

      const configuredModel = new ai.OpenAIImageEditRunnable({
        apiKey: config.apiKey,
        model: config.model,
      });
      imageEditModel = configuredModel;
      return configuredModel;
    };

    type GenerateBufferArgs = {
      prompt: string;
      purpose: ImagePurpose;
      size: ImageGenerationSize;
      recovery?: ProviderRecovery;
    };

    const generateImageBuffer = async ({
      prompt,
      purpose,
      size,
      recovery,
    }: GenerateBufferArgs): Promise<{
      buffer: Buffer;
      contentType: string;
      revisedPrompt?: string;
    }> => {
      if (aiConfig.image.provider === 'openai') await recovery?.beforeSubmit();
      const result = await imageGenerateModels[purpose].invoke({
        prompt,
        size,
        recovery,
      });

      fastify.log.debug({
        msg: 'Received generated image',
        provider: result.providerMeta.provider,
        model: result.providerMeta.model,
        requestId: result.providerMeta.requestId,
        revisedPrompt: result.revisedPrompt,
      });

      fastify.log.debug({
        msg: 'Image buffer ready',
        size: result.imageBuffer.length,
      });

      return {
        buffer: result.imageBuffer,
        contentType: result.contentType,
        revisedPrompt: result.revisedPrompt,
      };
    };

    const uploadBufferToCdn = async ({
      buffer,
      keyPrefix,
      contentType,
    }: {
      buffer: Buffer;
      keyPrefix: string;
      contentType: string;
    }) => {
      // Retry storage with the same bytes; never invoke the provider again.
      let uploadResult: { key: string; url: string } | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          uploadResult = await cdnClient.uploadBuffer({
            buffer,
            keyPrefix,
            contentType,
          });
          break;
        } catch (error) {
          if (attempt === 2) throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, 250 * (attempt + 1)),
          );
        }
      }
      if (!uploadResult) throw new Error('CDN upload failed');

      fastify.log.info({
        msg: 'Uploaded image to CDN',
        key: uploadResult.key,
        keyPrefix,
      });

      return uploadResult;
    };

    const maybeReuseOrUpload = async ({
      keyPrefix,
      generateBuffer,
    }: {
      keyPrefix: string;
      generateBuffer: () => Promise<{
        buffer: Buffer;
        contentType: string;
        revisedPrompt?: string;
      }>;
    }) => {
      const cached = await cdnClient.findObjectByPrefix({
        keyPrefix,
        select: 'latest',
      });

      if (cached) {
        fastify.log.info({
          msg: 'Reusing cached image from CDN',
          key: cached.key,
          keyPrefix,
        });

        return { ...cached, revisedPrompt: undefined };
      }

      const { buffer, contentType, revisedPrompt } = await generateBuffer();
      const uploadResult = await uploadBufferToCdn({
        buffer,
        keyPrefix,
        contentType,
      });

      return { ...uploadResult, revisedPrompt };
    };

    fastify.decorate('imageGen', {
      async generateImageToCdn({
        prompt,
        keyPrefix,
        purpose,
        size = defaultSize,
      }) {
        const model = aiConfig.image.models[purpose];
        const fingerprint = createImageCacheFingerprint({
          provider: aiConfig.image.provider,
          model,
          purpose,
          prompt,
          size,
        });
        const resolvedPrefix = `${ensureTrailingSlash(keyPrefix)}${fingerprint}/`;
        // A stored artifact is sufficient evidence of success even if the
        // upload acknowledgement or checkpoint write was lost.
        const artifact = await cdnClient.findObjectByPrefix({
          keyPrefix: resolvedPrefix,
          select: 'latest',
        });
        if (artifact) return { ...artifact, revisedPrompt: undefined };

        return recoverGeneration(
          { kind: 'image', fingerprint, keyPrefix },
          async (recovery) =>
            maybeReuseOrUpload({
              keyPrefix: resolvedPrefix,
              generateBuffer: () =>
                generateImageBuffer({ prompt, purpose, size, recovery }),
            }),
        );
      },

      async editImageToCdn({
        prompt,
        image,
        mask,
        keyPrefix,
        size = '1024x1024',
      }) {
        fastify.log.debug({ msg: 'Starting image edit operation' });

        const config = aiConfig.imageEdit;
        assertAIModelConfigured('imageEdit', config);
        const editModel = getImageEditModel();
        const fingerprint = generationFingerprint({
          provider: config.provider,
          model: config.model,
          prompt,
          size,
          image: image.toString('base64'),
          mask: mask.toString('base64'),
        });
        const resolvedPrefix = `${ensureTrailingSlash(keyPrefix || 'edits/')}${fingerprint}/`;
        const artifact = await cdnClient.findObjectByPrefix({
          keyPrefix: resolvedPrefix,
          select: 'latest',
        });
        if (artifact)
          return {
            ...artifact,
            meta: { provider: config.provider, model: config.model, size },
          };
        return recoverGeneration(
          { kind: 'edit', fingerprint, keyPrefix },
          async (recovery) => {
            await recovery.beforeSubmit();
            const result = await editModel.invoke({
              prompt,
              image,
              mask,
              size,
            });

            fastify.log.debug({
              msg: 'Received edited image',
              size: result.editedImageBuffer.length,
            });

            const { key, url } = await uploadBufferToCdn({
              buffer: result.editedImageBuffer,
              keyPrefix: resolvedPrefix,
              contentType: result.contentType,
            });

            return {
              key,
              url,
              meta: result.providerMeta,
            };
          },
        );
      },
    });
  },
  {
    name: 'image-generation',
    dependencies: ['cdn'],
  },
);

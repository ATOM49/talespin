import type {
  GeneratedImage,
  ImageGenerationInput,
  ImageGenerationModel,
} from '../../contracts.js';
import { SegmindClient } from './client.js';
import {
  SegmindModelEndpoint,
  type SegmindModelResponse,
} from './modelEndpoint.js';

export const SEGMIND_IMAGE_MODELS = {
  map: 'nano-banana-pro',
  character: 'seedream-4.5',
  faction: 'ideogram-4',
} as const;

type SegmindImageModelOptions = {
  client: SegmindClient;
  model?: string;
  version?: 'v1' | 'v2';
};

const toAspectRatio = (
  size: ImageGenerationInput['size'],
): '1:1' | '16:9' | '9:16' => {
  switch (size) {
    case '1792x1024':
      return '16:9';
    case '1024x1792':
      return '9:16';
    default:
      return '1:1';
  }
};

const toIdeogramImageSize = (
  size: ImageGenerationInput['size'],
): 'square_hd' | 'landscape_16_9' | 'portrait_16_9' => {
  switch (size) {
    case '1792x1024':
      return 'landscape_16_9';
    case '1024x1792':
      return 'portrait_16_9';
    default:
      return 'square_hd';
  }
};

const parseBinaryImage = (
  response: SegmindModelResponse,
  input: ImageGenerationInput,
  model: string,
): GeneratedImage => {
  if (response.version !== 'v1' || response.response.kind !== 'binary') {
    throw new Error(`Segmind model "${model}" did not return image bytes`);
  }

  return {
    imageBuffer: response.response.body,
    contentType: response.response.contentType,
    providerMeta: {
      provider: 'segmind',
      model,
      requestId: response.requestId,
      size: input.size,
    },
  };
};

const findImageUrl = (body: unknown): string | undefined => {
  if (typeof body === 'string' && body.startsWith('https://')) return body;
  if (!body || typeof body !== 'object') return undefined;

  const record = body as Record<string, unknown>;
  for (const key of ['output', 'image', 'url']) {
    const value = record[key];
    if (typeof value === 'string' && value.startsWith('https://')) return value;
  }

  for (const key of ['images', 'data']) {
    const values = record[key];
    if (!Array.isArray(values) || values.length === 0) continue;
    const first = values[0];
    if (typeof first === 'string' && first.startsWith('https://')) return first;
    if (first && typeof first === 'object') {
      const url = (first as Record<string, unknown>).url;
      if (typeof url === 'string' && url.startsWith('https://')) return url;
    }
  }

  return undefined;
};

const parseDataUrl = (
  body: unknown,
): { body: Buffer; contentType: string } | undefined => {
  if (!body || typeof body !== 'object') return undefined;
  const record = body as Record<string, unknown>;
  const candidate = [record.output, record.image, record.data].find(
    (value): value is string =>
      typeof value === 'string' && value.startsWith('data:image/'),
  );
  if (!candidate) return undefined;

  const match = /^data:([^;,]+);base64,(.+)$/.exec(candidate);
  if (!match?.[1] || !match[2]) return undefined;
  return { body: Buffer.from(match[2], 'base64'), contentType: match[1] };
};

const parseAsyncImage = async (
  client: SegmindClient,
  response: SegmindModelResponse,
  input: ImageGenerationInput,
  model: string,
): Promise<GeneratedImage> => {
  if (response.version !== 'v2')
    throw new Error('Expected async Segmind image result');
  const embedded = parseDataUrl(response.response);
  const imageUrl = findImageUrl(response.response);
  if (!embedded && !imageUrl)
    throw new Error(`Segmind model "${model}" returned no image URL`);
  const media = embedded ?? (await client.downloadMedia(imageUrl!));
  return {
    imageBuffer: media.body,
    contentType: media.contentType,
    providerMeta: {
      provider: 'segmind',
      model,
      requestId: response.requestId,
      size: input.size,
    },
  };
};

export const createNanoBananaProImageModel = ({
  client,
  model = SEGMIND_IMAGE_MODELS.map,
  version = 'v1',
}: SegmindImageModelOptions): ImageGenerationModel =>
  new SegmindModelEndpoint<ImageGenerationInput, GeneratedImage>({
    client,
    model,
    version,
    recovery: (input) => ({ ...input.recovery, submitMaxRetries: 0 }),
    v1ResponseType: 'binary',
    buildRequest: (input) => ({
      prompt: input.prompt,
      aspect_ratio: toAspectRatio(input.size),
      output_resolution: '2K',
      output_format: 'png',
      response_modalities: 'IMAGE',
      web_search: false,
    }),
    parseResponse: (response, input) =>
      response.version === 'v2'
        ? parseAsyncImage(client, response, input, model)
        : parseBinaryImage(response, input, model),
  });

export const createSeedreamImageModel = ({
  client,
  model = SEGMIND_IMAGE_MODELS.character,
  version = 'v1',
}: SegmindImageModelOptions): ImageGenerationModel =>
  new SegmindModelEndpoint<ImageGenerationInput, GeneratedImage>({
    client,
    model,
    version,
    recovery: (input) => ({ ...input.recovery, submitMaxRetries: 0 }),
    v1ResponseType: 'binary',
    buildRequest: (input) => ({
      prompt: input.prompt,
      size: '2K',
      aspect_ratio: toAspectRatio(input.size),
      max_images: 1,
      sequential_image_generation: 'disabled',
    }),
    parseResponse: (response, input) =>
      response.version === 'v2'
        ? parseAsyncImage(client, response, input, model)
        : parseBinaryImage(response, input, model),
  });

export const createIdeogramImageModel = ({
  client,
  model = SEGMIND_IMAGE_MODELS.faction,
  version = 'v1',
}: SegmindImageModelOptions): ImageGenerationModel =>
  new SegmindModelEndpoint<ImageGenerationInput, GeneratedImage>({
    client,
    model,
    version,
    recovery: (input) => ({ ...input.recovery, submitMaxRetries: 0 }),
    v1ResponseType: 'json',
    buildRequest: (input) => ({
      prompt: input.prompt,
      rendering_speed: 'BALANCED',
      image_size: toIdeogramImageSize(input.size),
      num_images: 1,
      // The public schema allows false, but the live endpoint currently
      // rejects it with HTTP 400. Keep enabled until Segmind fixes that path.
      enable_prompt_expansion: true,
      output_format: 'png',
      enable_safety_checker: true,
    }),
    parseResponse: async (response, input) => {
      if (response.version === 'v2')
        return parseAsyncImage(client, response, input, model);
      if (response.version !== 'v1' || response.response.kind !== 'json') {
        throw new Error(`Segmind model "${model}" did not return JSON`);
      }

      const embedded = parseDataUrl(response.response.body);
      const imageUrl = findImageUrl(response.response.body);
      if (!embedded && !imageUrl) {
        throw new Error(`Segmind model "${model}" returned no image URL`);
      }
      const media = embedded
        ? embedded
        : await client.downloadMedia(imageUrl as string);

      return {
        imageBuffer: media.body,
        contentType: media.contentType,
        providerMeta: {
          provider: 'segmind',
          model,
          requestId: response.requestId,
          size: input.size,
        },
      };
    },
  });

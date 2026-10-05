import { z } from 'zod';
import {
  CharacterGalleryImageSchema,
  CharacterImageRequestSchema,
} from '@talespin/schema';
import { watcherHeaders } from './watcher-client';

export interface ImageGenerationOptions {
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  baseUrl?: string;
}

export interface ImageGenerationResponse {
  imageUrl: string;
  revisedPrompt?: string;
}

const PolygonPointSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

const PolygonSchema = z.object({
  points: z.array(PolygonPointSchema).min(3),
});

const EditImageRequestSchema = z
  .object({
    prompt: z.string().min(1),
    imageUrl: z.string().url().optional(),
    imageBase64: z.string().min(1).optional(),
    polygon: PolygonSchema,
    size: z.enum(['256x256', '512x512', '1024x1024']).default('1024x1024'),
    keyPrefix: z.string().default('edits/'),
    featherPx: z.number().optional(),
    dilatePx: z.number().optional(),
  })
  .refine(
    (data) => Boolean(data.imageUrl || data.imageBase64),
    'Provide either imageUrl or imageBase64',
  );

const EditImageResponseSchema = z.object({
  imageUrl: z.string().url(),
  key: z.string(),
  meta: z.object({
    provider: z.string(),
    model: z.string(),
    size: z.string(),
    requestId: z.string().optional(),
  }),
});

export type EditImageRequestInput = z.input<typeof EditImageRequestSchema>;
export type EditImageResponse = z.infer<typeof EditImageResponseSchema>;

const CharacterGalleryResponseSchema = z.object({
  imageUrl: z.string().url(),
  revisedPrompt: z.string().optional(),
  images: z.array(CharacterGalleryImageSchema).min(1),
});

export const FactionImageRequestSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().optional(),
  description: z.string().optional(),
  tone: z.string().optional(),
  keywords: z.array(z.string()).default([]),
  promptHint: z.string().optional(),
});

export type FactionImageRequestInput = z.input<
  typeof FactionImageRequestSchema
>;

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; details?: unknown };

/**
 * Generic service for generating images via external APIs
 * Supports any endpoint and data schema with Zod validation
 */
export class ImageGenerationService {
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly baseUrl: string;

  constructor(options?: ImageGenerationOptions) {
    const configuredTimeout = Number(
      process.env.WATCHER_GENERATION_TIMEOUT_MS || 180000,
    );
    this.timeout =
      options?.timeout ??
      (Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 180000);
    this.maxRetries = options?.maxRetries ?? 2;
    this.retryDelay = options?.retryDelay ?? 1000; // 1 second
    this.baseUrl =
      options?.baseUrl ||
      process.env.WATCHER_API_URL ||
      'http://localhost:4000';
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async callWatcherWithRetry(
    endpoint: string,
    body: string,
    attempt = 0,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: watcherHeaders(),
        body,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (
        response.status >= 500 &&
        response.status < 600 &&
        attempt < this.maxRetries
      ) {
        console.log(
          `Retrying ${endpoint} after ${this.retryDelay}ms due to server error...`,
        );
        await this.sleep(this.retryDelay * (attempt + 1));
        return this.callWatcherWithRetry(endpoint, body, attempt + 1);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(
          `Request to ${endpoint} timed out after ${this.timeout}ms`,
        );
      }

      if (attempt < this.maxRetries) {
        console.log(
          `Retrying ${endpoint} after ${this.retryDelay}ms due to network error...`,
        );
        await this.sleep(this.retryDelay * (attempt + 1));
        return this.callWatcherWithRetry(endpoint, body, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Generic method to generate an image URL by calling an external API
   * @param endpoint - The API endpoint to call (e.g., '/generate/map')
   * @param data - The data to send in the request
   * @param schema - Zod schema to validate the data before sending
   * @returns The generated image URL or null if generation fails
   */
  async generateImageUrl<T extends z.ZodType>(
    endpoint: string,
    data: unknown,
    schema: T,
  ): Promise<string | null> {
    try {
      const validatedData = schema.parse(data);

      console.log(`Generating image at ${endpoint}:`, validatedData);

      const response = await this.callWatcherWithRetry(
        endpoint,
        JSON.stringify(validatedData),
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to generate image (${response.status}):`,
          errorText,
        );
        return null;
      }

      const result = (await response.json()) as
        | ImageGenerationResponse
        | { error: string; details?: string };

      if ('error' in result) {
        console.error('Image generation error:', result.error, result.details);
        return null;
      }

      if (!result.imageUrl) {
        console.error('No imageUrl in response:', result);
        return null;
      }

      console.log('Image generated successfully:', result.imageUrl);
      if (result.revisedPrompt) {
        console.log('Revised prompt:', result.revisedPrompt);
      }

      return result.imageUrl;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Validation error:', error.issues);
        return null;
      }

      console.error('Error generating image:', error);
      return null;
    }
  }

  async editImageRegion(
    payload: EditImageRequestInput,
  ): Promise<ServiceResult<EditImageResponse>> {
    try {
      const validatedPayload = EditImageRequestSchema.parse(payload);

      const response = await this.callWatcherWithRetry(
        '/generate/edit-image',
        JSON.stringify(validatedPayload),
      );

      const responseText = await response.text();

      if (!response.ok) {
        let errorPayload: { error?: string; details?: string } | undefined;
        try {
          errorPayload = JSON.parse(responseText);
        } catch {
          // noop
        }

        return {
          ok: false,
          status: response.status,
          error: errorPayload?.error || 'Image edit request failed',
          details: errorPayload?.details || responseText,
        };
      }

      let parsedResponse: EditImageResponse;
      try {
        parsedResponse = EditImageResponseSchema.parse(
          JSON.parse(responseText),
        );
      } catch (parseError) {
        console.error(
          'Invalid response from image editing service:',
          parseError,
        );
        return {
          ok: false,
          status: 502,
          error: 'Invalid response from image editing service',
          details:
            parseError instanceof Error ? parseError.message : 'Unknown error',
        };
      }

      return {
        ok: true,
        data: parsedResponse,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          ok: false,
          status: 400,
          error: 'Invalid request payload',
          details: error.flatten(),
        };
      }

      console.error('Error editing image:', error);
      return {
        ok: false,
        status: 500,
        error: 'Image edit request failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async generateCharacterGallery(
    data: unknown,
  ): Promise<z.infer<typeof CharacterGalleryImageSchema>[] | null> {
    try {
      const validatedData = CharacterImageRequestSchema.parse(data);
      const response = await this.callWatcherWithRetry(
        '/generate/character',
        JSON.stringify(validatedData),
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          `Failed to generate character gallery (${response.status}):`,
          errorText,
        );
        return null;
      }

      const raw = await response.json();
      const parsed = CharacterGalleryResponseSchema.safeParse(raw);

      if (!parsed.success) {
        console.error('Invalid gallery payload received:', parsed.error);
        return null;
      }

      return parsed.data.images;
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Gallery request validation error:', error.issues);
        return null;
      }

      console.error('Error generating character gallery:', error);
      return null;
    }
  }
}

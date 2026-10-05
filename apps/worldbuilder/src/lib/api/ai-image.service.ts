import { z } from 'zod';
import {
  CharacterImageRequestSchema,
  type CharacterGalleryImage,
  type EditImageRequestInput,
  type EditImageResponse,
  type WatcherInput,
} from '@talespin/schema';
import { WatcherClient, WatcherError } from './watcher-client';

export { FactionImageRequestSchema } from '@talespin/schema';
export type {
  FactionImageRequestInput,
  EditImageRequestInput,
  EditImageResponse,
} from '@talespin/schema';
export interface ImageGenerationOptions {
  timeout?: number;
  baseUrl?: string;
}
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string; details?: unknown };

export class ImageGenerationService {
  private readonly watcher: WatcherClient;
  constructor(options?: ImageGenerationOptions) {
    this.watcher = new WatcherClient({
      baseUrl: options?.baseUrl,
      timeoutMs: options?.timeout,
    });
  }
  async generateImageUrl<T extends z.ZodType>(
    endpoint: '/generate/map' | '/generate/faction',
    data: unknown,
    schema: T,
  ): Promise<string | null> {
    try {
      const result = await this.watcher.request(
        endpoint,
        schema.parse(data) as WatcherInput<typeof endpoint>,
      );
      return result.imageUrl;
    } catch (error) {
      console.error(
        'Image generation failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return null;
    }
  }
  async editImageRegion(
    payload: EditImageRequestInput,
  ): Promise<ServiceResult<EditImageResponse>> {
    try {
      return {
        ok: true,
        data: await this.watcher.request('/generate/edit-image', payload),
      };
    } catch (error) {
      return {
        ok: false,
        status:
          error instanceof z.ZodError
            ? 400
            : error instanceof WatcherError
              ? error.status
              : 502,
        error:
          error instanceof Error ? error.message : 'Image edit request failed',
      };
    }
  }
  async generateCharacterGallery(
    data: unknown,
  ): Promise<CharacterGalleryImage[] | null> {
    try {
      const result = await this.watcher.request(
        '/generate/character-gallery',
        CharacterImageRequestSchema.parse(data),
      );
      return result.images;
    } catch (error) {
      console.error(
        'Character gallery generation failed:',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return null;
    }
  }
}

export type AIProvider = 'openai' | 'segmind';

export type SchemaLike<T> = {
  parse(value: unknown): T;
};

export type StructuredOutputInput<T> = {
  prompt: string;
  schema: SchemaLike<T>;
  temperature?: number;
  maxRetries?: number;
};

export type StructuredOutputResult<T> = {
  structuredResponse: T;
  providerMeta: {
    provider: AIProvider;
    model: string;
    requestId?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export interface StructuredOutputModel<T> {
  invoke(input: StructuredOutputInput<T>): Promise<StructuredOutputResult<T>>;
}

export type MultimodalImageInput =
  | {
      type: 'url';
      url: string;
    }
  | {
      type: 'base64';
      data: string;
      mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
    };

export type MultimodalStructuredOutputInput<T> = Omit<
  StructuredOutputInput<T>,
  'prompt'
> & {
  text: string;
  image: MultimodalImageInput;
};

export interface MultimodalStructuredOutputModel<T> {
  invoke(
    input: MultimodalStructuredOutputInput<T>,
  ): Promise<StructuredOutputResult<T>>;
}

export type ImageGenerationSize = '1024x1024' | '1792x1024' | '1024x1792';

export type ImageGenerationInput = {
  prompt: string;
  size: ImageGenerationSize;
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  recovery?: {
    requestId?: string;
    beforeSubmit(): Promise<void>;
    onSubmitted(requestId: string): Promise<void>;
  };
};

export type GeneratedImage = {
  imageBuffer: Buffer;
  contentType: string;
  revisedPrompt?: string;
  providerMeta: {
    provider: AIProvider;
    model: string;
    requestId?: string;
    size: string;
    quality?: string;
    style?: string;
  };
};

export interface ImageGenerationModel {
  invoke(input: ImageGenerationInput): Promise<GeneratedImage>;
}

export type ImageEditSize = '256x256' | '512x512' | '1024x1024';

export type ImageEditInput = {
  prompt: string;
  negativePrompt?: string;
  image: Buffer;
  mask: Buffer;
  size: ImageEditSize;
};

export type EditedImage = {
  editedImageBuffer: Buffer;
  contentType: string;
  providerMeta: {
    provider: AIProvider;
    model: string;
    requestId?: string;
    size: string;
  };
};

export interface ImageEditModel {
  invoke(input: ImageEditInput): Promise<EditedImage>;
}

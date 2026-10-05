import { z } from 'zod';
import { recoverGeneration } from '../services/generation-recovery.js';
import {
  OpenAIMultimodalStructuredOutputRunnable,
  OpenAIStructuredOutputRunnable,
  type MultimodalStructuredOutputModel,
  type StructuredOutputModel,
} from '@talespin/ai';
import {
  assertAIModelConfigured,
  loadAIConfig,
  missingSegmindAdapterError,
} from './ai.js';

export const createStructuredOutputModel = <T>(): StructuredOutputModel<T> => {
  const config = loadAIConfig().text;
  assertAIModelConfigured('text', config);

  if (config.provider === 'segmind') {
    throw missingSegmindAdapterError('text', config);
  }

  const model = new OpenAIStructuredOutputRunnable<T>({
    apiKey: config.apiKey,
    model: config.model,
  });
  return {
    invoke: async (input) => {
      const { schema, ...identity } = input;
      const result = await recoverGeneration(
        {
          kind: 'text',
          provider: config.provider,
          model: config.model,
          ...identity,
          schema: z.toJSONSchema(schema as z.ZodType, {
            unrepresentable: 'any',
          }),
        },
        async () => {
          const result = await model.invoke(input);
          return {
            ...result,
            structuredResponse: schema.parse(result.structuredResponse),
          };
        },
      );
      return {
        ...result,
        structuredResponse: schema.parse(result.structuredResponse),
      };
    },
  };
};

export const createMultimodalStructuredOutputModel = <
  T,
>(): MultimodalStructuredOutputModel<T> => {
  const config = loadAIConfig().text;
  assertAIModelConfigured('text', config);

  if (config.provider === 'segmind') {
    throw missingSegmindAdapterError('text', config);
  }

  const model = new OpenAIMultimodalStructuredOutputRunnable<T>({
    apiKey: config.apiKey,
    model: config.model,
  });
  return {
    invoke: async (input) => {
      const { schema, ...identity } = input;
      const result = await recoverGeneration(
        {
          kind: 'vision',
          provider: config.provider,
          model: config.model,
          ...identity,
          schema: z.toJSONSchema(schema as z.ZodType, {
            unrepresentable: 'any',
          }),
        },
        async () => {
          const result = await model.invoke(input);
          return {
            ...result,
            structuredResponse: schema.parse(result.structuredResponse),
          };
        },
      );
      return {
        ...result,
        structuredResponse: schema.parse(result.structuredResponse),
      };
    },
  };
};

import {
  CharacterGeneratedDetailsSchema,
  CharacterGroupSchema,
} from '@talespin/schema';
import { RunnableLambda } from '@langchain/core/runnables';
import { characterProfileTemplate } from '../prompts/characterProfileTemplate.js';
import { z } from 'zod';
import { createStructuredOutputModel } from '../config/models.js';

const summaryFromGroups = (groups: z.infer<typeof CharacterGroupSchema>[]) => {
  if (!groups.length) {
    return 'No species markers supplied.';
  }

  return groups
    .map((group) =>
      group.summary ? `${group.name}: ${group.summary}` : group.name,
    )
    .join('; ');
};

interface CharacterProfileChainInput {
  name: string;
  description?: string;
  species: z.infer<typeof CharacterGroupSchema>[];
}

export const createCharacterProfileChain = () => {
  const profileChain =
    createStructuredOutputModel<
      z.infer<typeof CharacterGeneratedDetailsSchema>
    >();

  return RunnableLambda.from(async (input: CharacterProfileChainInput) => {
    const prompt = await characterProfileTemplate.format({
      name: input.name,
      description: input.description ?? 'No description provided.',
      species: summaryFromGroups(input.species),
    });

    const { structuredResponse } = await profileChain.invoke({
      prompt,
      schema: CharacterGeneratedDetailsSchema,
      temperature: 0.65,
    });

    return structuredResponse;
  });
};

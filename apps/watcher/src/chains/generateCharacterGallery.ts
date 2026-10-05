import { CharacterGalleryImageSchema } from '@talespin/schema';
import { RunnableSequence, RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import turnaroundPlannerTemplate from '../prompts/turnaroundPlannerTemplate.js';
import type { FastifyInstance } from 'fastify';
import { createStructuredOutputModel } from '../config/models.js';
import {
  buildCharacterGalleryImagePrompt,
  selectCharacterStagingCue,
} from '../prompts/character-variation.js';

const TurnaroundShotSchema = z.object({
  angle: z.string().min(1),
  summary: z.string().min(1),
  prompt: z.string().min(1),
});

const TurnaroundPlanSchema = z.object({
  signatureProp: z.string().min(1),
  shots: z.array(TurnaroundShotSchema).min(2).max(3),
});

export const createCharacterGalleryChain = (fastify: FastifyInstance) => {
  const plannerChain =
    createStructuredOutputModel<z.infer<typeof TurnaroundPlanSchema>>();

  return RunnableSequence.from([
    RunnableLambda.from(
      async (input: { characterBrief: string; slug: string }) => {
        const stagingCue = selectCharacterStagingCue(input.characterBrief);
        const plannerPrompt = await turnaroundPlannerTemplate.format({
          characterBrief: input.characterBrief,
          stagingCue,
        });

        const { structuredResponse: plan } = await plannerChain.invoke({
          prompt: plannerPrompt,
          schema: TurnaroundPlanSchema,
          temperature: 0.6,
        });

        return {
          plan,
          slug: input.slug,
          characterBrief: input.characterBrief,
          stagingCue,
        };
      },
    ),
    RunnableLambda.from(
      async ({
        plan,
        slug,
        characterBrief,
        stagingCue,
      }: {
        plan: z.infer<typeof TurnaroundPlanSchema>;
        slug: string;
        characterBrief: string;
        stagingCue: string;
      }) => {
        const images: z.infer<typeof CharacterGalleryImageSchema>[] = [];

        for (const shot of plan.shots) {
          // Keep model-planned poses inside the shared single-subject art contract.
          const enforcedPrompt = buildCharacterGalleryImagePrompt({
            characterBrief,
            shot,
            signatureProp: plan.signatureProp,
            stagingCue,
          });

          const { url: imageUrl, revisedPrompt } =
            await fastify.imageGen.generateImageToCdn({
              prompt: enforcedPrompt,
              keyPrefix: `characters/${slug}/${shot.angle}`,
              purpose: 'character',
              // Request a portrait orientation (taller-than-wide) to keep images consistent
              size: '1024x1792',
            });

          images.push({
            angle: shot.angle,
            description: shot.summary,
            imageUrl,
            revisedPrompt: revisedPrompt ?? shot.prompt,
          });
        }
        console.log({ images });
        return { images };
      },
    ),
  ]);
};

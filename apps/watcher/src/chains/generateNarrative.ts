import {
  GeneratedInteractionModelOutputSchema,
  GeneratedInteractionProposalSchema,
  InteractionOutcomeModelOutputSchema,
  InteractionOutcomeSchema,
  MissionSetupProposalSchema,
  NarrativeGenerationRequestSchema,
  StoryOutlineProposalSchema,
  TransportOptionsModelOutputSchema,
  TransportOptionsProposalSchema,
  type NarrativeGenerationRequest,
  type NarrativeGenerationResponse,
} from '@talespin/schema';
import { createStructuredOutputModel } from '../config/models.js';
import { narrativePrompt } from '../prompts/narrative.js';

const omitNullFields = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(omitNullFields);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== null)
        .map(([key, item]) => [key, omitNullFields(item)]),
    );
  }
  return value;
};

export const createNarrativeGenerationFunction = () =>
  async function generateNarrative(
    input: NarrativeGenerationRequest,
  ): Promise<NarrativeGenerationResponse> {
    const request = NarrativeGenerationRequestSchema.parse(input);
    const prompt = narrativePrompt(request);

    if (request.kind === 'OUTLINE') {
      const model =
        createStructuredOutputModel<
          typeof StoryOutlineProposalSchema._output
        >();
      const { structuredResponse } = await model.invoke({
        prompt,
        schema: StoryOutlineProposalSchema,
        temperature: 0.7,
      });
      return {
        kind: 'OUTLINE',
        proposal: StoryOutlineProposalSchema.parse(structuredResponse),
      };
    }

    if (request.kind === 'MISSION_SETUP') {
      const model =
        createStructuredOutputModel<
          typeof MissionSetupProposalSchema._output
        >();
      const { structuredResponse } = await model.invoke({
        prompt,
        schema: MissionSetupProposalSchema,
        temperature: 0.65,
      });
      return {
        kind: 'MISSION_SETUP',
        proposal: MissionSetupProposalSchema.parse(structuredResponse),
      };
    }

    if (request.kind === 'INTERACTION') {
      const model =
        createStructuredOutputModel<
          typeof GeneratedInteractionModelOutputSchema._output
        >();
      const { structuredResponse } = await model.invoke({
        prompt,
        schema: GeneratedInteractionModelOutputSchema,
        temperature: 0.75,
      });
      return {
        kind: 'INTERACTION',
        proposal: GeneratedInteractionProposalSchema.parse(
          omitNullFields(structuredResponse),
        ),
      };
    }

    if (request.kind === 'TRANSPORT') {
      const model =
        createStructuredOutputModel<
          typeof TransportOptionsModelOutputSchema._output
        >();
      const { structuredResponse } = await model.invoke({
        prompt,
        schema: TransportOptionsModelOutputSchema,
        temperature: 0.75,
      });
      return {
        kind: 'TRANSPORT',
        proposal: TransportOptionsProposalSchema.parse(
          omitNullFields(structuredResponse),
        ),
      };
    }

    const model =
      createStructuredOutputModel<
        typeof InteractionOutcomeModelOutputSchema._output
      >();
    const { structuredResponse } = await model.invoke({
      prompt,
      schema: InteractionOutcomeModelOutputSchema,
      temperature: 0.6,
    });
    return {
      kind: 'ACTION_RESOLUTION',
      proposal: InteractionOutcomeSchema.parse(
        omitNullFields(structuredResponse),
      ),
    };
  };

import { z } from 'zod';
import { CharacterSchema } from './character';
import { Id } from './common';
import { CellIdSchema, GridCellSchema } from './grid-cell';
import {
  TransportOptionSchema,
  TravelPlanSchema,
  TraversalMediumSchema,
} from './travel';
import { WorldGridSchema } from './world-grid';
import { WorldSchema } from './world';
import { StoryOverviewSchema } from './story';

export const ChapterStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'COMPLETED']);
export const MissionStatusSchema = z.enum([
  'PREPARING',
  'ACTIVE',
  'SUCCESS',
  'FAILED',
]);
export const InteractionStatusSchema = z.enum([
  'READY',
  'RESOLVING',
  'RESOLVED',
  'FAILED',
]);
export const InteractionKindSchema = z.enum([
  'MOVEMENT',
  'TRANSPORT',
  'DIALOGUE',
  'EXPLORATION',
  'DISCOVERY',
  'DECISION',
  'FINALE',
]);
export const NarrativeJobKindSchema = z.enum([
  'OUTLINE',
  'MISSION_SETUP',
  'INTERACTION',
  'TRANSPORT',
  'ACTION_RESOLUTION',
]);
export const NarrativeJobStatusSchema = z.enum([
  'QUEUED',
  'GENERATING',
  'COMPLETED',
  'FAILED',
]);

const ObjectiveBaseSchema = z.object({
  id: Id,
  label: z.string().min(1),
  required: z.boolean().default(true),
  complete: z.boolean().default(false),
});

export const MissionObjectiveSchema = z.discriminatedUnion('type', [
  ObjectiveBaseSchema.extend({
    type: z.literal('REACH_CELL'),
    cellId: CellIdSchema,
  }),
  ObjectiveBaseSchema.extend({
    type: z.literal('RESOLVE_INTERACTION'),
    interactionKind: InteractionKindSchema,
  }),
  ObjectiveBaseSchema.extend({
    type: z.literal('LEARN_FACT'),
    factKey: z.string().min(1),
  }),
  ObjectiveBaseSchema.extend({
    type: z.literal('ACQUIRE_ITEM'),
    itemKey: z.string().min(1),
  }),
  ObjectiveBaseSchema.extend({
    type: z.literal('USE_ITEM'),
    itemKey: z.string().min(1),
  }),
]);

export const InteractionTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('WORLD') }),
  z.object({ type: z.literal('CELL'), cellId: CellIdSchema }),
  z.object({ type: z.literal('WORLD_CHARACTER'), characterId: Id }),
  z.object({ type: z.literal('STORY_CHARACTER'), storyCharacterId: Id }),
]);

export const InteractionChoiceSchema = z.object({
  id: Id,
  label: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const PlayerActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('SET_DESTINATION'),
    destinationCellId: CellIdSchema,
  }),
  z.object({ type: z.literal('CHOOSE_TRANSPORT'), optionId: Id }),
  z.object({ type: z.literal('CONTINUE_TRAVEL') }),
  z.object({ type: z.literal('CHOOSE_INTERACTION'), choiceId: Id }),
  z.object({
    type: z.literal('FREE_TEXT'),
    text: z.string().trim().min(1).max(800),
  }),
  z.object({ type: z.literal('RETRY_MISSION') }),
]);

export const SubmitMissionActionSchema = z.object({
  actionId: z.string().min(1).max(120),
  expectedVersion: z.number().int().nonnegative(),
  action: PlayerActionSchema,
});

export const StoryStateChangeSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DISCOVER_FACT'),
    key: z.string().min(1),
    summary: z.string().min(1),
  }),
  z.object({
    type: z.literal('ADD_ITEM'),
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
  }),
  z.object({
    type: z.literal('USE_ITEM'),
    key: z.string().min(1),
  }),
  z.object({
    type: z.literal('UPDATE_RELATIONSHIP'),
    characterRef: Id,
    delta: z.number().int().min(-100).max(100),
    summary: z.string().optional(),
  }),
  z.object({
    type: z.literal('OPEN_THREAD'),
    key: z.string().min(1),
    summary: z.string().min(1),
  }),
  z.object({ type: z.literal('CLOSE_THREAD'), key: z.string().min(1) }),
  z.object({
    type: z.literal('RECORD_CONSEQUENCE'),
    summary: z.string().min(1),
  }),
]);

const StoryStateChangeModelOutputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DISCOVER_FACT'),
    key: z.string().min(1),
    summary: z.string().min(1),
  }),
  z.object({
    type: z.literal('ADD_ITEM'),
    key: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1).nullable(),
  }),
  z.object({
    type: z.literal('USE_ITEM'),
    key: z.string().min(1),
  }),
  z.object({
    type: z.literal('UPDATE_RELATIONSHIP'),
    characterRef: Id,
    delta: z.number().int().min(-100).max(100),
    summary: z.string().min(1).nullable(),
  }),
  z.object({
    type: z.literal('OPEN_THREAD'),
    key: z.string().min(1),
    summary: z.string().min(1),
  }),
  z.object({ type: z.literal('CLOSE_THREAD'), key: z.string().min(1) }),
  z.object({
    type: z.literal('RECORD_CONSEQUENCE'),
    summary: z.string().min(1),
  }),
]);

export const InteractionOutcomeSchema = z.object({
  narrative: z.string().min(1),
  accepted: z.boolean().default(true),
  stateChanges: z.array(StoryStateChangeSchema).default([]),
  completedObjectiveIds: z.array(Id).default([]),
});

export const InteractionOutcomeModelOutputSchema = z.object({
  narrative: z.string().min(1),
  accepted: z.boolean(),
  stateChanges: z.array(StoryStateChangeModelOutputSchema),
  completedObjectiveIds: z.array(Id),
});

export const ChapterSchema = z.object({
  _id: Id,
  storyId: Id,
  order: z.number().int().min(1).max(3),
  title: z.string().min(1),
  summary: z.string().min(1),
  missionPrompt: z.string().min(1),
  status: ChapterStatusSchema,
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().optional().nullable(),
});

export const MissionSchema = z.object({
  _id: Id,
  storyId: Id,
  chapterId: Id,
  retryOfMissionId: Id.optional().nullable(),
  attempt: z.number().int().positive(),
  title: z.string().min(1),
  summary: z.string().min(1),
  status: MissionStatusSchema,
  version: z.number().int().nonnegative(),
  startCellId: CellIdSchema,
  destinationCellId: CellIdSchema,
  waypointCellIds: z.array(CellIdSchema).default([]),
  currentCellId: CellIdSchema,
  revealedCellIds: z.array(CellIdSchema).default([]),
  objectives: z.array(MissionObjectiveSchema).min(1),
  maxActions: z.number().int().positive(),
  actionsUsed: z.number().int().nonnegative(),
  travelPlan: TravelPlanSchema.optional().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional().nullable(),
});

export const StoryCharacterSchema = z.object({
  _id: Id,
  storyId: Id,
  name: z.string().min(1),
  description: z.string().min(1),
  traits: z.array(z.string()).default([]),
  currentCellId: CellIdSchema.optional().nullable(),
  createdAt: z.string().datetime(),
});

export const InteractionSchema = z.object({
  _id: Id,
  missionId: Id,
  sequence: z.number().int().nonnegative(),
  kind: InteractionKindSchema,
  status: InteractionStatusSchema,
  cellId: CellIdSchema,
  traversedCellIds: z.array(CellIdSchema).default([]),
  target: InteractionTargetSchema,
  blocking: z.boolean().default(true),
  situation: z.string().min(1),
  choices: z.array(InteractionChoiceSchema).default([]),
  transportOptions: z.array(TransportOptionSchema).default([]),
  playerAction: PlayerActionSchema.optional().nullable(),
  outcome: InteractionOutcomeSchema.optional().nullable(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

export const NarrativeJobSchema = z.object({
  _id: Id,
  storyId: Id,
  kind: NarrativeJobKindSchema,
  status: NarrativeJobStatusSchema,
  targetId: Id,
  attempt: z.number().int().nonnegative(),
  retryable: z.boolean(),
  error: z.string().optional().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const StoryOutlineRequestSchema = z.object({
  storyId: Id,
  world: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    theme: z.string().optional(),
    lore: z.unknown().optional(),
  }),
  character: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    traits: z.array(z.string()).default([]),
  }),
  regionHooks: z.array(z.string()).default([]),
});

export const StoryOutlineProposalSchema = z.object({
  title: z.string().min(1),
  premise: z.string().min(1),
  chapters: z
    .array(
      z.object({
        order: z.number().int().min(1).max(3),
        title: z.string().min(1),
        summary: z.string().min(1),
        missionPrompt: z.string().min(1),
      }),
    )
    .length(3)
    .refine(
      (chapters) =>
        chapters
          .map((chapter) => chapter.order)
          .sort()
          .join(',') === '1,2,3',
      'Chapter orders must be exactly 1, 2, and 3.',
    ),
});

export const MissionSetupProposalSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  destinationHint: z.string().min(1),
  encounterPrompt: z.string().min(1),
  discoveryPrompt: z.string().min(1),
  maxActions: z.number().int().min(12).max(80).default(36),
});

export const NarrativeGenerationRequestSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('OUTLINE'), input: StoryOutlineRequestSchema }),
  z.object({
    kind: z.literal('MISSION_SETUP'),
    input: z.object({
      storyTitle: z.string().min(1),
      storyPremise: z.string().min(1),
      chapterTitle: z.string().min(1),
      chapterSummary: z.string().min(1),
      missionPrompt: z.string().min(1),
      startCellId: CellIdSchema,
      cells: z.array(
        z.object({
          id: CellIdSchema,
          name: z.string().optional(),
          biome: z.string().optional(),
          tags: z.array(z.string()).default([]),
        }),
      ),
      isFinale: z.boolean(),
      knownFacts: z.array(z.string()).default([]),
      consequences: z.array(z.string()).default([]),
    }),
  }),
  z.object({
    kind: z.literal('INTERACTION'),
    input: z.object({
      storyTitle: z.string(),
      chapterTitle: z.string(),
      missionTitle: z.string(),
      cell: GridCellSchema,
      character: z
        .object({ name: z.string(), description: z.string().optional() })
        .optional(),
      isFinale: z.boolean().default(false),
      knownFacts: z.array(z.string()).default([]),
    }),
  }),
  z.object({
    kind: z.literal('TRANSPORT'),
    input: z.object({
      storyTitle: z.string().min(1),
      missionTitle: z.string().min(1),
      medium: TraversalMediumSchema,
      terrainTags: z.array(z.string()).default([]),
      situation: z.string().min(1),
    }),
  }),
  z.object({
    kind: z.literal('ACTION_RESOLUTION'),
    input: z.object({
      situation: z.string(),
      action: PlayerActionSchema,
      objectiveIds: z.array(Id),
    }),
  }),
]);

export const GeneratedInteractionProposalSchema = z.object({
  situation: z.string().min(1),
  kind: InteractionKindSchema.exclude(['MOVEMENT', 'TRANSPORT']),
  choices: z.array(InteractionChoiceSchema).min(2).max(4),
  character: z
    .object({
      name: z.string().min(1),
      description: z.string().min(1),
      traits: z.array(z.string()).default([]),
    })
    .optional(),
});

export const GeneratedInteractionModelOutputSchema = z.object({
  situation: z.string().min(1),
  kind: InteractionKindSchema.exclude(['MOVEMENT', 'TRANSPORT']),
  choices: z
    .array(
      z.object({
        id: Id,
        label: z.string().min(1),
        description: z.string().min(1).nullable(),
      }),
    )
    .min(2)
    .max(4),
  character: z
    .object({
      name: z.string().min(1),
      description: z.string().min(1),
      traits: z.array(z.string()),
    })
    .nullable(),
});

export const TransportOptionsProposalSchema = z.object({
  options: z.array(TransportOptionSchema).min(2).max(3),
});

export const TransportOptionsModelOutputSchema = z.object({
  options: z
    .array(
      z.object({
        id: Id,
        name: z.string().min(1),
        description: z.string().min(1),
        supportedMedia: z.array(TraversalMediumSchema).min(1),
        actionCost: z.number().int().positive(),
        consequence: z.string().min(1).nullable(),
      }),
    )
    .min(2)
    .max(3),
});

export const NarrativeGenerationResponseSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('OUTLINE'),
    proposal: StoryOutlineProposalSchema,
  }),
  z.object({
    kind: z.literal('MISSION_SETUP'),
    proposal: MissionSetupProposalSchema,
  }),
  z.object({
    kind: z.literal('INTERACTION'),
    proposal: GeneratedInteractionProposalSchema,
  }),
  z.object({
    kind: z.literal('TRANSPORT'),
    proposal: TransportOptionsProposalSchema,
  }),
  z.object({
    kind: z.literal('ACTION_RESOLUTION'),
    proposal: InteractionOutcomeSchema,
  }),
]);

export const MissionPlayViewSchema = z.object({
  story: z.object({
    _id: Id,
    title: z.string(),
    status: z.enum(['ACTIVE', 'COMPLETED', 'ABANDONED']),
  }),
  storyState: StoryOverviewSchema.shape.state,
  world: WorldSchema,
  character: CharacterSchema,
  chapter: ChapterSchema,
  chapters: z.array(ChapterSchema),
  mission: MissionSchema,
  grid: z.object({ grid: WorldGridSchema, cells: z.array(GridCellSchema) }),
  currentInteraction: InteractionSchema.optional().nullable(),
  interactions: z.array(InteractionSchema),
  generationPending: z.boolean().default(false),
  failedJobId: Id.optional().nullable(),
  generationError: z.string().optional().nullable(),
});

export const StoryPlayViewSchema = StoryOverviewSchema.extend({
  chapters: z.array(ChapterSchema),
  activeMissionId: Id.optional().nullable(),
  failedJobId: Id.optional().nullable(),
  generationError: z.string().optional().nullable(),
});

export type Chapter = z.infer<typeof ChapterSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type MissionObjective = z.infer<typeof MissionObjectiveSchema>;
export type Interaction = z.infer<typeof InteractionSchema>;
export type InteractionKind = z.infer<typeof InteractionKindSchema>;
export type InteractionTarget = z.infer<typeof InteractionTargetSchema>;
export type PlayerAction = z.infer<typeof PlayerActionSchema>;
export type SubmitMissionAction = z.infer<typeof SubmitMissionActionSchema>;
export type StoryStateChange = z.infer<typeof StoryStateChangeSchema>;
export type InteractionOutcome = z.infer<typeof InteractionOutcomeSchema>;
export type StoryCharacter = z.infer<typeof StoryCharacterSchema>;
export type NarrativeJob = z.infer<typeof NarrativeJobSchema>;
export type StoryOutlineProposal = z.infer<typeof StoryOutlineProposalSchema>;
export type MissionSetupProposal = z.infer<typeof MissionSetupProposalSchema>;
export type TransportOptionsProposal = z.infer<
  typeof TransportOptionsProposalSchema
>;
export type NarrativeGenerationRequest = z.infer<
  typeof NarrativeGenerationRequestSchema
>;
export type NarrativeGenerationResponse = z.infer<
  typeof NarrativeGenerationResponseSchema
>;
export type MissionPlayView = z.infer<typeof MissionPlayViewSchema>;
export type StoryPlayView = z.infer<typeof StoryPlayViewSchema>;

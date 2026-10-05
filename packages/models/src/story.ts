import { z } from 'zod';
import { CharacterSchema } from './character';
import { Id } from './common';
import { WorldSchema } from './world';

export const StoryStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'ABANDONED']);
export const StorySetupStatusSchema = z.enum([
  'QUEUED',
  'GENERATING',
  'READY',
  'FAILED',
]);

export const StoryInventoryItemSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

export const StoryThreadSchema = z.object({
  key: z.string().min(1),
  summary: z.string().min(1),
});

export const StoryRelationshipSchema = z.object({
  characterRef: Id,
  disposition: z.number().int().min(-100).max(100),
  summary: z.string().optional(),
});

export const StoryStateSchema = z.object({
  knownFacts: z.array(z.string()).default([]),
  consequences: z.array(z.string()).default([]),
  unresolvedThreads: z.array(z.string()).default([]),
  inventory: z.array(StoryInventoryItemSchema).default([]),
  usedItemKeys: z.array(z.string()).default([]),
  relationships: z.array(StoryRelationshipSchema).default([]),
  visitedCellIds: z.array(Id).default([]),
  travelHistory: z.array(z.string()).default([]),
});

export const StartStorySchema = z.object({
  characterId: Id,
});

export const StoryParticipantSchema = z.object({
  _id: Id,
  storyId: Id,
  userId: Id,
  characterId: Id,
  joinedAt: z.string().datetime(),
});

export const StorySchema = z.object({
  _id: Id,
  worldId: Id,
  startedByUserId: Id,
  title: z.string().min(1),
  status: StoryStatusSchema,
  setupStatus: StorySetupStatusSchema,
  setupError: z.string().optional().nullable(),
  premise: z.string().optional().nullable(),
  state: StoryStateSchema,
  participants: z.array(StoryParticipantSchema).min(1),
  startedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional().nullable(),
});

export const StoryParticipantOverviewSchema = StoryParticipantSchema.extend({
  character: CharacterSchema,
});

export const StoryOverviewSchema = StorySchema.extend({
  world: WorldSchema,
  participants: z.array(StoryParticipantOverviewSchema).min(1),
});

export type StartStoryInput = z.infer<typeof StartStorySchema>;
export type Story = z.infer<typeof StorySchema>;
export type StoryParticipant = z.infer<typeof StoryParticipantSchema>;
export type StoryOverview = z.infer<typeof StoryOverviewSchema>;

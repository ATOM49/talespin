import { z } from 'zod';
import { Id } from './common';
import { CellIdSchema } from './grid-cell';

export const TreasureHuntEventTypeSchema = z.enum(['MOVE', 'EXPLORE']);
export type TreasureHuntEventType = z.infer<typeof TreasureHuntEventTypeSchema>;

const BaseEventSchema = z.object({
  runId: Id,
  playerId: Id,
  createdAt: z.string().datetime(),
});

export const MovementEventPayloadSchema = z.object({
  fromCellId: CellIdSchema,
  toCellId: CellIdSchema,
});

export const ExploreEventPayloadSchema = z.object({
  cellId: CellIdSchema,
  actionIndex: z.number().int().positive(),
  isOnPath: z.boolean(),
  isBeforeKey: z.boolean().optional(),
  isBetweenKeyAndTreasure: z.boolean().optional(),
  narrative: z.string(),
});

export const TreasureHuntEventBaseSchema = z.object({
  runId: Id,
  playerId: Id,
  type: TreasureHuntEventTypeSchema,
  createdAt: z.string().datetime(),
  payload: z.union([MovementEventPayloadSchema, ExploreEventPayloadSchema]),
});

export const TreasureHuntEventFormSchema = TreasureHuntEventBaseSchema;

export const TreasureHuntEventSchema = TreasureHuntEventBaseSchema.extend({
  _id: Id,
});

export type TreasureHuntEvent = z.infer<typeof TreasureHuntEventSchema>;
export type TreasureHuntEventForm = z.infer<typeof TreasureHuntEventFormSchema>;

// Discriminated union helpers for type narrowing
export const MoveEventFormSchema = BaseEventSchema.extend({
  type: z.literal('MOVE'),
  payload: MovementEventPayloadSchema,
});

export const ExploreEventFormSchema = BaseEventSchema.extend({
  type: z.literal('EXPLORE'),
  payload: ExploreEventPayloadSchema,
});

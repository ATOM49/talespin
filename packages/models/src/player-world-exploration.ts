import { z } from 'zod';
import { Id } from './common';
import { CellIdSchema } from './grid-cell';

export const PlayerWorldExplorationBaseSchema = z.object({
  playerId: Id,
  worldId: Id,
  exploredCellIds: z.array(CellIdSchema).default([]),
  totalRuns: z.number().int().nonnegative().default(0),
  bestRunActions: z.number().int().positive().nullable().optional(),
});

export const PlayerWorldExplorationFormSchema =
  PlayerWorldExplorationBaseSchema;

export const PlayerWorldExplorationSchema =
  PlayerWorldExplorationBaseSchema.extend({
    _id: Id,
  });

export type PlayerWorldExploration = z.infer<
  typeof PlayerWorldExplorationSchema
>;
export type PlayerWorldExplorationForm = z.infer<
  typeof PlayerWorldExplorationFormSchema
>;

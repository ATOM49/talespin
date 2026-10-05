import { z } from 'zod';
import { Id } from './common';
import { CellIdSchema } from './grid-cell';

export const TreasureHuntRunStatusSchema = z.enum([
  'ACTIVE',
  'SUCCESS',
  'FAILED',
]);
export type TreasureHuntRunStatus = z.infer<typeof TreasureHuntRunStatusSchema>;

export const TreasureHuntRunBaseSchema = z.object({
  worldId: Id,
  gridId: Id,
  playerId: Id,
  runIndex: z.number().int().nonnegative(),
  status: TreasureHuntRunStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional().nullable(),
  maxActions: z.number().int().positive(),
  actionsUsed: z.number().int().nonnegative().default(0),
  homeCellId: CellIdSchema,
  keyCellId: CellIdSchema,
  treasureCellId: CellIdSchema,
  pathCellIds: z.array(CellIdSchema),
  keyIndexInPath: z.number().int().nonnegative(),
  revealedPathCellIds: z.array(CellIdSchema).default([]),
  currentCellId: CellIdSchema,
  hasKey: z.boolean().default(false),
  keyFoundAtAction: z.number().int().positive().optional(),
  treasureFoundAtAction: z.number().int().positive().optional(),
});

export const TreasureHuntRunFormSchema = TreasureHuntRunBaseSchema;

export const TreasureHuntRunSchema = TreasureHuntRunBaseSchema.extend({
  _id: Id,
});

export type TreasureHuntRun = z.infer<typeof TreasureHuntRunSchema>;
export type TreasureHuntRunForm = z.infer<typeof TreasureHuntRunFormSchema>;

import { z } from 'zod';
import { Id } from './common';
import { CellIdSchema } from './grid-cell';

export const WorldGridBaseSchema = z.object({
  worldId: Id,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  homeCellId: CellIdSchema,
});

export const WorldGridFormSchema = WorldGridBaseSchema;

export const WorldGridSchema = WorldGridBaseSchema.extend({
  _id: Id,
});

export type WorldGrid = z.infer<typeof WorldGridSchema>;
export type WorldGridForm = z.infer<typeof WorldGridFormSchema>;

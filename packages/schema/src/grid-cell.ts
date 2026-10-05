import { z } from 'zod';
import { Id } from './common';
import { TraversalProfileSchema } from './travel';

export const CellIdSchema = z.string().min(1);
export type CellId = z.infer<typeof CellIdSchema>;

export const GridCellBaseSchema = z.object({
  gridId: Id,
  x: z.number().int(),
  y: z.number().int(),
  walkable: z.boolean(),
  traversal: TraversalProfileSchema.optional(),
  biome: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).default([]),
});

export const GridCellFormSchema = GridCellBaseSchema;

export const GridCellSchema = GridCellBaseSchema.extend({
  _id: Id,
});

export type GridCell = z.infer<typeof GridCellSchema>;
export type GridCellForm = z.infer<typeof GridCellFormSchema>;

import { z } from 'zod';

const CellCoordinateSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});

export const RegionSelectionSchema = z.object({
  startCell: CellCoordinateSchema.optional(),
  endCell: CellCoordinateSchema.optional(),
});

export type RegionSelection = z.infer<typeof RegionSelectionSchema>;

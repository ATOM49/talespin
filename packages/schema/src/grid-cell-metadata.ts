import { z } from 'zod';

export const GridCellMetadataSchema = z.object({
  cellX: z.number().int().nonnegative(),
  cellY: z.number().int().nonnegative(),
  index: z.number().int().nonnegative(),
  selected: z.boolean(),
});

export type GridCellMetadata = z.infer<typeof GridCellMetadataSchema>;

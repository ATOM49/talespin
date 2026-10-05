import { z } from 'zod';

export const GridConfigSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
  cellsX: z.number().int().positive(),
  cellsY: z.number().int().positive(),
  showGrid: z.boolean(),
});

export type GridConfig = z.infer<typeof GridConfigSchema>;

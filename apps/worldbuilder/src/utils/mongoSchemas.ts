import { z } from 'zod';
import { GridConfigSchema, GridCellMetadataSchema } from '@talespin/schema';

// MongoDB-specific document schemas extending base schemas
export const GridCellDocumentSchema = GridCellMetadataSchema.pick({
  cellX: true,
  cellY: true,
  index: true,
}).extend({
  x: z.number(),
  y: z.number(),
});

export const GridDocumentSchema = GridConfigSchema.extend({
  worldImageUrl: z.string().url().optional(),
  selectedCells: z.array(GridCellDocumentSchema),
});

export type GridDocument = z.infer<typeof GridDocumentSchema>;
export type GridCellDocument = z.infer<typeof GridCellDocumentSchema>;

export const buildGridDocument = (payload: GridDocument) =>
  GridDocumentSchema.parse(payload);

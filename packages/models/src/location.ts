import { z } from 'zod';
import { Id, RelCoord } from './common';

export const LocationBaseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  coordRel: RelCoord,
  gridCellId: Id.optional(),
  props: z.record(z.string(), z.any()).optional(),
});

export const LocationFormSchema = LocationBaseSchema;

export const LocationSchema = LocationBaseSchema.extend({
  _id: Id,
  worldId: Id,
});

export type Location = z.infer<typeof LocationSchema>;
export type LocationForm = z.infer<typeof LocationFormSchema>;

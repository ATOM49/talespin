import { z } from 'zod';
import { Id, RelCoord } from './common';
import { EntityType } from './enums';

export const EntityBaseSchema = z.object({
  type: EntityType,
  name: z.string(),
  locationId: Id.optional(),
  gridCellId: Id.optional(),
  coordRel: RelCoord.optional(),
  attributes: z.record(z.string(), z.any()).optional(),
  tags: z.array(z.string()).default([]),
});

export const EntityFormSchema = EntityBaseSchema;

export const EntitySchema = EntityBaseSchema.extend({
  _id: Id,
  worldId: Id,
});

export type Entity = z.infer<typeof EntitySchema>;
export type EntityForm = z.infer<typeof EntityFormSchema>;

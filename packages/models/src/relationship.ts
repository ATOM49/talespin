import { z } from 'zod';
import { Id } from './common';
import { RelationshipType } from './enums';

export const RelationshipBaseSchema = z.object({
  fromEntityId: Id,
  toEntityId: Id,
  type: RelationshipType,
  weight: z.number().optional(),
  constraints: z.record(z.string(), z.any()).optional(),
  validity: z.record(z.string(), z.any()).optional(),
  props: z.record(z.string(), z.any()).optional(),
});

export const RelationshipFormSchema = RelationshipBaseSchema;

export const RelationshipSchema = RelationshipBaseSchema.extend({
  _id: Id,
  worldId: Id,
});

export type Relationship = z.infer<typeof RelationshipSchema>;
export type RelationshipForm = z.infer<typeof RelationshipFormSchema>;

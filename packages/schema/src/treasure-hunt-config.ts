import { z } from 'zod';
import { Id } from './common';

export const TreasureHuntConfigBaseSchema = z.object({
  worldId: Id,
  maxActionsPerRun: z.number().int().positive(),
  minKeyDistance: z.number().int().nonnegative(),
  maxKeyDistance: z.number().int().positive(),
  minTreasureDistanceFromKey: z.number().int().nonnegative(),
  maxTreasureDistanceFromKey: z.number().int().positive(),
});

export const TreasureHuntConfigFormSchema = TreasureHuntConfigBaseSchema;

export const TreasureHuntConfigSchema = TreasureHuntConfigBaseSchema.extend({
  _id: Id,
});

export type TreasureHuntConfig = z.infer<typeof TreasureHuntConfigSchema>;
export type TreasureHuntConfigForm = z.infer<
  typeof TreasureHuntConfigFormSchema
>;

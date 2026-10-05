import { z } from 'zod';
import { Id } from './common';
import { CampaignStatus } from './enums';

export const CampaignBaseSchema = z.object({
  name: z.string(),
  startEntityId: Id,
  endEntityId: Id,
  goal: z.record(z.string(), z.any()),
  constraints: z.record(z.string(), z.any()).optional(),
  status: CampaignStatus,
});

export const CampaignFormSchema = CampaignBaseSchema;

export const CampaignSchema = CampaignBaseSchema.extend({
  _id: Id,
  worldId: Id,
  createdAt: z.string().datetime(),
});

export type Campaign = z.infer<typeof CampaignSchema>;
export type CampaignForm = z.infer<typeof CampaignFormSchema>;

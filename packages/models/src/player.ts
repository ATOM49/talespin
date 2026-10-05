import { z } from 'zod';
import { Id } from './common';

export const PlayerBaseSchema = z.object({
  name: z.string().min(1, 'Name must not be empty'),
  email: z.string().email().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const PlayerFormSchema = PlayerBaseSchema.omit({
  createdAt: true,
  updatedAt: true,
});

export const PlayerSchema = PlayerBaseSchema.extend({
  _id: Id,
});

export type Player = z.infer<typeof PlayerSchema>;
export type PlayerForm = z.infer<typeof PlayerFormSchema>;

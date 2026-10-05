import { z } from 'zod';
import { Id } from './common';

const TravelCellIdSchema = z.string().min(1);

export const TraversalMediumSchema = z.enum([
  'LAND',
  'WATER',
  'MOUNTAIN',
  'SUBTERRANEAN',
  'AERIAL',
  'ARCANE',
]);

export const TraversalProfileSchema = z.object({
  medium: TraversalMediumSchema,
  difficulty: z.number().int().min(1).max(5).default(1),
  footAllowed: z.boolean().default(true),
  tags: z.array(z.string()).default([]),
});

export const TransportOptionSchema = z.object({
  id: Id,
  name: z.string().min(1),
  description: z.string().min(1),
  supportedMedia: z.array(TraversalMediumSchema).min(1),
  actionCost: z.number().int().positive(),
  consequence: z.string().min(1).optional(),
});

export const TravelStopKindSchema = z.enum([
  'TRANSPORT',
  'WAYPOINT',
  'ENCOUNTER',
  'DESTINATION',
]);

export const TravelStopSchema = z.object({
  cellId: TravelCellIdSchema,
  routeIndex: z.number().int().nonnegative(),
  kind: TravelStopKindSchema,
});

export const TravelLegSchema = z.object({
  startIndex: z.number().int().nonnegative(),
  endIndex: z.number().int().nonnegative(),
  medium: TraversalMediumSchema,
  transport: TransportOptionSchema.optional(),
  actionCost: z.number().int().nonnegative(),
});

export const TravelPlanSchema = z.object({
  destinationCellId: TravelCellIdSchema,
  pathCellIds: z.array(TravelCellIdSchema).min(1),
  currentIndex: z.number().int().nonnegative(),
  legs: z.array(TravelLegSchema).min(1),
  stops: z.array(TravelStopSchema),
  estimatedActionCost: z.number().int().nonnegative(),
});

export type TraversalMedium = z.infer<typeof TraversalMediumSchema>;
export type TraversalProfile = z.infer<typeof TraversalProfileSchema>;
export type TransportOption = z.infer<typeof TransportOptionSchema>;
export type TravelStop = z.infer<typeof TravelStopSchema>;
export type TravelLeg = z.infer<typeof TravelLegSchema>;
export type TravelPlan = z.infer<typeof TravelPlanSchema>;

import { z } from 'zod';
import { Id } from './common';

export const GridCoordinateSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
});

export const MapBoundsSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  })
  .superRefine((bounds, context) => {
    if (bounds.x + bounds.width > 1.000001) {
      context.addIssue({
        code: 'custom',
        message: 'Region bounds exceed the map width.',
        path: ['width'],
      });
    }
    if (bounds.y + bounds.height > 1.000001) {
      context.addIssue({
        code: 'custom',
        message: 'Region bounds exceed the map height.',
        path: ['height'],
      });
    }
  });

export const RegionInfluenceSchema = z.enum([
  'dominant',
  'established',
  'contested',
  'hidden',
]);

export const RegionFactionPresenceSchema = z.object({
  factionId: Id,
  influence: RegionInfluenceSchema,
  rationale: z.string().min(1),
});

export const RegionBaseSchema = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
  description: z.string().min(1),
  biome: z.string().min(1),
  atmosphere: z.string().min(1),
  mapBounds: MapBoundsSchema,
  cellIds: z.array(Id).min(1),
  missionHooks: z.array(z.string().min(1)).min(1),
  factionPresence: z.array(RegionFactionPresenceSchema).default([]),
});

export const RegionFormSchema = RegionBaseSchema;

export const RegionSchema = RegionBaseSchema.extend({
  _id: Id,
  worldId: Id,
  gridId: Id,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type GridCoordinate = z.infer<typeof GridCoordinateSchema>;
export type MapBounds = z.infer<typeof MapBoundsSchema>;
export type Region = z.infer<typeof RegionSchema>;
export type RegionForm = z.infer<typeof RegionFormSchema>;
export type RegionFactionPresence = z.infer<typeof RegionFactionPresenceSchema>;

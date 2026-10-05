import { z } from 'zod';

export const Id = z.string().min(1);

export const AbsCoord = z.object({
  x: z.coerce.number().nonnegative(),
  y: z.coerce.number().nonnegative(),
});

export const RelCoord = z.object({
  u: z.coerce.number().min(0).max(1),
  v: z.coerce.number().min(0).max(1),
});

export const RelPath = z.array(RelCoord).min(2);
export const RelRing = z.array(RelCoord).min(4);
export const RelPolygon = z.object({
  outer: RelRing,
  holes: z.array(RelRing).optional(),
});

export type TId = z.infer<typeof Id>;
export type TAbsCoord = z.infer<typeof AbsCoord>;
export type TRelCoord = z.infer<typeof RelCoord>;
export type TRelPath = z.infer<typeof RelPath>;
export type TRelRing = z.infer<typeof RelRing>;
export type TRelPolygon = z.infer<typeof RelPolygon>;

import { z } from 'zod';

export const uuid = z.guid();
export const TakeoverBody = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  force: z.boolean().default(false),
}).default({ force: false });
export const ReleaseBody = z.object({
  note: z.string().trim().min(1).max(500).optional(),
}).default({});

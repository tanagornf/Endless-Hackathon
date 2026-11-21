import { z } from 'zod';

export type { FeatureFlagView } from './types';

export const SetFeatureFlagBody = z.object({
  hidden: z.boolean(),
  reason: z.string().max(200).optional(),
});

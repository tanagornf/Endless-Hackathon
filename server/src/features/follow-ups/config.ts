import { z } from 'zod';
import type { FollowUpSettings } from '@nless/shared/features/follow-ups/types';

export const defaultSettings: Omit<FollowUpSettings, 'businessId' | 'timezone'> = {
  enabled: false,
  delayHours: 4,
  quietStart: '21:00',
  quietEnd: '08:00',
  allowedChannels: ['web'],
  version: 1,
};

const quietTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const updateSettingsBody = z.object({
  expectedVersion: z.number().int().min(1).max(2_147_483_646),
  enabled: z.boolean(),
  delayHours: z.number().int().min(1).max(48),
  quietStart: quietTime,
  quietEnd: quietTime,
  allowedChannels: z.array(z.enum(['web', 'line'])).max(2)
    .transform((channels) => [...new Set(channels)]),
}).strict();

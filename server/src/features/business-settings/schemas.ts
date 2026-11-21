import { z } from 'zod';
import { AppError } from '../../core';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.array(z.strictObject({ open: hhmm, close: hhmm })).max(4);
const reveal = z.enum(['always', 'never', 'ask_staff']);

export const BusinessIdSchema = z.guid();
export const AiSwitchBody = z.strictObject({ enabled: z.boolean() });
export const WeeklyHoursSchema = z.strictObject({
  mon: day, tue: day, wed: day, thu: day, fri: day, sat: day, sun: day,
});
export const AnswerPolicySchema = z.strictObject({
  price: z.strictObject({ reveal }).optional(),
  stock: z.strictObject({ reveal }).optional(),
  contact: z.strictObject({ reveal: z.enum(['always', 'never']) }).optional(),
  generalKnowledge: z.boolean().optional(),
  booking: z.strictObject({ enabled: z.boolean() }).optional(),
});
export const CapabilitiesSchema = z.strictObject({
  canQuotePrices: z.boolean(),
  canTakeOrders: z.boolean(),
  canTakeBookings: z.boolean(),
  canHandoffToHuman: z.boolean(),
  canShareContact: z.boolean(),
});

export function parseSettingsInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new AppError('VALIDATION_ERROR', 'Invalid business settings input', {
    details: {
      issues: result.error.issues.map(({ code, path, message }) => ({ code, path: path.join('.'), message })),
    },
  });
}

export const HoursBody = z.strictObject({ expectedVersion: z.number().int().min(1), hours: WeeklyHoursSchema });
const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const ClosureBody = z.strictObject({
  startDate: LocalDate,
  endDate: LocalDate,
  reason: z.string().trim().max(200).default(''),
});
export const ClosuresQuery = z.object({ scope: z.enum(['upcoming', 'all']).default('upcoming') });
export const OpenStateQuery = z.object({ at: z.iso.datetime().optional() });

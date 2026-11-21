import { z } from 'zod';

function isValidTimeZone(timezone: string): boolean {
  // Intl also accepts numeric UTC offsets, but the settings contract uses IANA names.
  if (!/^[A-Za-z]/.test(timezone)) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

export const CreateBusinessBody = z.strictObject({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().min(1).max(64).refine(isValidTimeZone).default('Asia/Bangkok'),
  language: z.enum(['th', 'en']).default('th'),
});

export const DeleteBusinessQuery = z.object({ confirmName: z.string().min(1).max(80) });

export type BusinessInput = z.input<typeof CreateBusinessBody>;

import { z } from 'zod';
import type { RangeInfo } from '@nless/shared/features/analytics/types';
import { AppError, db } from '../../core';

export const rangeQuery = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() });
export type RangeQuery = z.infer<typeof rangeQuery>;

export async function resolveRange(timezone: string, query: RangeQuery): Promise<RangeInfo> {
  const period = await db.one<{ from: string; to: string; from_utc: Date; to_utc: Date; days: number }>(`
    WITH last_day AS (SELECT coalesce($2::date,(now() AT TIME ZONE $3)::date) AS day),
    days AS (SELECT coalesce($1::date,day-6) AS first,day AS last FROM last_day)
    SELECT first::text AS "from",last::text AS "to",first::timestamp AT TIME ZONE $3 AS from_utc,
      (last+1)::timestamp AT TIME ZONE $3 AS to_utc,last-first+1 AS days FROM days`,
    [query.from ?? null, query.to ?? null, timezone]);
  if (period.days < 1 || period.days > 93) throw new AppError('VALIDATION_ERROR', 'Select a reporting period of up to 93 days');
  return { from: period.from, to: period.to, timezone, fromUtc: period.from_utc.toISOString(), toUtc: period.to_utc.toISOString() };
}

export function eachDate(range: RangeInfo): string[] {
  const start = Date.parse(range.from + 'T00:00:00Z');
  const end = Date.parse(range.to + 'T00:00:00Z');
  return Array.from({ length: (end - start) / 86_400_000 + 1 }, (_, offset) =>
    new Date(start + offset * 86_400_000).toISOString().slice(0, 10));
}

import type { BusinessClosure } from '@nless/shared/features/business-settings/types';
import { AppError, db } from '../../core';
import type { DbExecutor } from '../../core';
import { isRealDate, localDateDuration, localParts } from './hours';
import { readSettings } from './repo';
import { BusinessIdSchema } from './schemas';

const maxClosures = 200;
const maxClosureDays = 366;
const projection = 'id, to_char(start_date, \'YYYY-MM-DD\') AS "startDate", ' +
  'to_char(end_date, \'YYYY-MM-DD\') AS "endDate", reason';

export type ClosureInput = Pick<BusinessClosure, 'startDate' | 'endDate' | 'reason'>;

function invalid(path: string, code: string, message: string, conflictId?: string): never {
  throw new AppError('VALIDATION_ERROR', message, {
    details: {
      issues: [{ path, code, message }],
      ...(conflictId ? { conflictId } : {}),
    },
  });
}

export async function readClosures(businessId: string, endingOnOrAfter: string | null): Promise<BusinessClosure[]> {
  const { rows } = await db.query<BusinessClosure>(
    'SELECT ' + projection + ' FROM business_closures WHERE business_id=$1 ' +
    (endingOnOrAfter ? 'AND end_date >= $2::date ORDER BY start_date, id' : 'ORDER BY start_date DESC, id') +
    ' LIMIT ' + maxClosures,
    endingOnOrAfter ? [businessId, endingOnOrAfter] : [businessId],
  );
  return rows;
}

export async function lockClosures(businessId: string, ex: DbExecutor): Promise<void> {
  await ex.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['bizsettings:' + businessId]);
}

export async function insertClosure(
  businessId: string, actorUserId: string, input: ClosureInput, ex: DbExecutor,
): Promise<BusinessClosure> {
  if (!isRealDate(input.startDate)) invalid('startDate', 'invalid_date', 'Enter a valid start date');
  if (!isRealDate(input.endDate)) invalid('endDate', 'invalid_date', 'Enter a valid end date');
  if (input.endDate < input.startDate) invalid('endDate', 'end_before_start', 'End date is before the start date');
  if (localDateDuration(input.startDate, input.endDate) >= maxClosureDays) {
    invalid('endDate', 'closure_too_long', 'Closures can last at most 366 days');
  }

  const { timezone } = await readSettings(businessId, ex);
  const today = localParts(new Date(), timezone).date;
  if (input.endDate < today) invalid('endDate', 'closure_in_past', 'End date is already in the past');

  const count = await ex.one<{ count: number }>('SELECT count(*)::int AS count FROM business_closures WHERE business_id=$1', [businessId]);
  if (count.count >= maxClosures) invalid('startDate', 'too_many_closures', 'The business has the maximum number of closures');

  const overlap = await ex.maybeOne<{ id: string }>(
    'SELECT id FROM business_closures WHERE business_id=$1 AND start_date<=$2::date AND end_date>=$3::date LIMIT 1',
    [businessId, input.endDate, input.startDate],
  );
  if (overlap) invalid('startDate', 'closure_overlap', 'Closure overlaps an existing window', overlap.id);

  return ex.one<BusinessClosure>(
    'INSERT INTO business_closures (business_id, start_date, end_date, reason, created_by) VALUES ($1,$2::date,$3::date,$4,$5) ' +
    'RETURNING ' + projection,
    [businessId, input.startDate, input.endDate, input.reason, actorUserId],
  );
}

export async function removeClosure(businessId: string, closureId: string, ex: DbExecutor): Promise<void> {
  if (!BusinessIdSchema.safeParse(closureId).success) throw new AppError('NOT_FOUND', 'Closure not found');
  const result = await ex.query('DELETE FROM business_closures WHERE business_id=$1 AND id=$2', [businessId, closureId]);
  if (!result.rowCount) throw new AppError('NOT_FOUND', 'Closure not found');
}

import { AppError, db } from '../../core';
import { formatMessage, messageColumns } from './mappers';
import type { DbMessage } from './mappers';

type Range = { first: number; last: number };
type Cursor = { seen: number; sweep?: Range; nextSweep?: Range };
const pageSize = 30;

function decode(value?: string): Cursor {
  if (!value) return { seen: 0 };
  const bytes = Buffer.from(value, 'base64url');
  const fields = bytes.toString('utf8').split('.');
  const numbers = fields.map(Number);
  const [seen, first, last, nextFirst, nextLast] = numbers;
  if (bytes.toString('base64url') === value && fields.every((field, i) =>
    /^[1-9]\d*$/u.test(field) && Number.isSafeInteger(numbers[i]))) {
    if (fields.length === 1) return { seen };
    if ((fields.length === 3 || fields.length === 5) && first <= last && last <= seen
      && (fields.length === 3 || (nextFirst <= nextLast && nextLast <= seen))) {
      return { seen, sweep: { first, last }, nextSweep: nextFirst ? { first: nextFirst, last: nextLast } : undefined };
    }
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid Demo Chat cursor');
}

function encode({ seen, sweep, nextSweep }: Cursor) {
  if (!seen) return null;
  const fields = [seen];
  if (sweep) fields.push(sweep.first, sweep.last);
  if (nextSweep) fields.push(nextSweep.first, nextSweep.last);
  return Buffer.from(fields.join('.')).toString('base64url');
}

function include(range: Range | undefined, seq: number): Range {
  return range ? { first: Math.min(range.first, seq), last: Math.max(range.last, seq) } : { first: seq, last: seq };
}

export async function readDemoHistory(businessId: string, conversationId: string, after?: string) {
  const previous = decode(after);
  const key = [businessId, conversationId];
  // Terminal failures and system rows cannot become visible. Exclude them before paging.
  const freshQuery = db.query<DbMessage>(`SELECT ${messageColumns} FROM messages
    WHERE business_id=$1 AND conversation_id=$2 AND seq>$3 AND author<>'system'
      AND (direction<>'outbound' OR author<>'ai' OR delivery_state IN ('not_required','pending','sent'))
    ORDER BY seq ${after ? 'ASC' : 'DESC'} LIMIT $4`, [...key, previous.seen, pageSize]);
  // Each sweep revisits at most one page. Fresh messages advance independently of an orphaned delivery.
  const sweep = previous.sweep;
  const retryQuery = sweep ? db.query<DbMessage>(`SELECT ${messageColumns} FROM messages
    WHERE business_id=$1 AND conversation_id=$2 AND seq BETWEEN $3 AND $4 AND direction='outbound' AND author='ai'
      AND delivery_state IN ('not_required','pending','sent') ORDER BY seq LIMIT $5`,
  [...key, sweep.first, sweep.last, pageSize + 1]) : Promise.resolve({ rows: [] as DbMessage[] });
  const [fresh, retried] = await Promise.all([freshQuery, retryQuery]);
  if (!after) fresh.rows.reverse();
  const seen = fresh.rows.at(-1)?.seq ?? previous.seen;
  let nextSweep = previous.nextSweep;
  let waiting: DbMessage | undefined;
  const rows = [...retried.rows.slice(0, pageSize), ...fresh.rows];
  const visible = [];
  for (const row of rows) {
    if (row.direction === 'outbound' && row.author === 'ai' && row.delivery.state !== 'sent') {
      nextSweep = include(nextSweep, row.seq);
      waiting = row;
    } else {
      visible.push(formatMessage(row));
    }
  }
  const continuation = retried.rows[pageSize];
  const cursor = continuation && sweep
    ? { seen, sweep: { first: continuation.seq, last: sweep.last }, nextSweep }
    : { seen, sweep: nextSweep };
  return { items: visible, cursor: encode(cursor), waiting: waiting?.seq === seen ? waiting : undefined };
}

import { AppError, db } from '../../core';
import { formatMessage, messageColumns } from './mappers';
import type { DbMessage } from './mappers';

type Range = { first: number; last: number };
type Cursor = { seen: number; ids?: number[]; sweep?: Range; nextSweep?: Range };
const pageSize = 30;
const exactLimit = 4;
const undecided = "direction='outbound' AND author='ai' AND delivery_state IN ('not_required','pending')";
const visible = "author<>'system' AND (direction<>'outbound' OR author<>'ai' OR delivery_state='sent')";

function decode(value: string): Cursor {
  const bytes = Buffer.from(value, 'base64url');
  const raw = bytes.toString('utf8');
  const exact = raw.includes(':');
  const fields = raw.split(exact ? /[,:]/u : '.');
  const numbers = fields.map(Number);
  const [seen, first, last, nextFirst, nextLast] = numbers;
  if (bytes.toString('base64url') === value && fields.every((field, i) =>
    /^[1-9]\d*$/u.test(field) && Number.isSafeInteger(numbers[i]) && numbers[i] <= seen)) {
    if (exact) {
      const ids = numbers.slice(1);
      if (ids.length <= exactLimit && ids.every((id, i) => i === 0 || id > ids[i - 1])) return { seen, ids };
    } else {
      if (fields.length === 1) return { seen };
      if ((fields.length === 3 || fields.length === 5) && first <= last
        && (fields.length === 3 || nextFirst <= nextLast)) {
        return { seen, sweep: { first, last }, nextSweep: nextFirst ? { first: nextFirst, last: nextLast } : undefined };
      }
    }
  }
  throw new AppError('VALIDATION_ERROR', 'Invalid Demo Chat cursor');
}

function encode({ seen, ids, sweep, nextSweep }: Cursor) {
  if (!seen) return null;
  if (ids?.length) return Buffer.from(seen + ':' + ids.join(',')).toString('base64url');
  const fields = [seen];
  if (sweep) fields.push(sweep.first, sweep.last);
  if (nextSweep) fields.push(nextSweep.first, nextSweep.last);
  return Buffer.from(fields.join('.')).toString('base64url');
}

function include(range: Range | undefined, seq: number): Range {
  return range ? { first: Math.min(range.first, seq), last: Math.max(range.last, seq) } : { first: seq, last: seq };
}

async function initialHistory(key: string[]) {
  // Use a single snapshot so a reply changing to sent between the two selections cannot be lost.
  const result = await db.one<{ messages: DbMessage[]; pending: { seq: number; last: number; since: string }[] }>(`
    SELECT COALESCE((SELECT jsonb_agg(v ORDER BY v.seq) FROM (
      SELECT ${messageColumns} FROM messages WHERE business_id=$1 AND conversation_id=$2 AND ${visible}
      ORDER BY seq DESC LIMIT $3) v),'[]') AS messages,
    COALESCE((SELECT jsonb_agg(p ORDER BY p.seq) FROM (
      SELECT seq::float8 AS seq, max(seq) OVER ()::float8 AS last, max(created_at) OVER () AS since
      FROM messages WHERE business_id=$1 AND conversation_id=$2 AND ${undecided}
      ORDER BY seq LIMIT $4) p),'[]') AS pending`, [...key, pageSize, exactLimit + 1]);
  const first = result.pending[0];
  const seen = Math.max(result.messages.at(-1)?.seq ?? 0, first?.last ?? 0);
  const cursor: Cursor = { seen };
  if (first) {
    if (result.pending.length <= exactLimit) cursor.ids = result.pending.map((row) => row.seq);
    else cursor.sweep = { first: first.seq, last: first.last };
  }
  return {
    items: result.messages.map((row) => formatMessage({ ...row, createdAt: new Date(row.createdAt) })),
    cursor: encode(cursor), waitingSince: first?.last === seen ? first.since : undefined,
    immediate: seen > 0, revisiting: Boolean(first),
  };
}

export async function readDemoHistory(businessId: string, conversationId: string, after?: string) {
  const key = [businessId, conversationId];
  if (!after) return initialHistory(key);
  const previous = decode(after);
  const freshQuery = db.query<DbMessage>(`SELECT ${messageColumns} FROM messages
    WHERE business_id=$1 AND conversation_id=$2 AND seq>$3 AND (${visible} OR (${undecided}))
    ORDER BY seq LIMIT $4`, [...key, previous.seen, pageSize]);
  // Small sets retain the exact unresolved sequences. Larger sets use bounded, resumable scans.
  const sweep = previous.sweep;
  const retryQuery = previous.ids || sweep ? db.query<DbMessage>(`SELECT ${messageColumns} FROM messages
    WHERE business_id=$1 AND conversation_id=$2 AND direction='outbound' AND author='ai'
      AND delivery_state IN ('not_required','pending','sent')
      AND ${sweep ? 'seq BETWEEN $3 AND $4' : 'seq=ANY($3::bigint[])'} ORDER BY seq LIMIT ${pageSize + 1}`,
  sweep ? [...key, sweep.first, sweep.last] : [...key, previous.ids]) : Promise.resolve({ rows: [] as DbMessage[] });
  const [fresh, retried] = await Promise.all([freshQuery, retryQuery]);
  const seen = fresh.rows.at(-1)?.seq ?? previous.seen;
  let nextSweep = previous.nextSweep;
  let exact: number[] | undefined = nextSweep ? undefined : [];
  let waitingSince: string | undefined;
  const items = [];
  for (const row of [...retried.rows.slice(0, pageSize), ...fresh.rows]) {
    if (row.direction === 'outbound' && row.author === 'ai' && row.delivery.state !== 'sent') {
      nextSweep = include(nextSweep, row.seq);
      if (exact && exact.length < exactLimit) exact.push(row.seq);
      else exact = undefined;
      if (row.seq === seen) waitingSince = row.createdAt.toISOString();
    } else items.push(formatMessage(row));
  }
  const continuation = retried.rows[pageSize];
  const cursor: Cursor = { seen };
  if (continuation && sweep) {
    cursor.sweep = { first: continuation.seq, last: sweep.last };
    cursor.nextSweep = nextSweep;
  } else if (exact?.length) cursor.ids = exact;
  else cursor.sweep = nextSweep;
  const revisiting = Boolean(cursor.sweep || cursor.ids);
  const settled = Boolean(previous.sweep || previous.ids) && !revisiting;
  return { items, cursor: encode(cursor), waitingSince, immediate: seen > previous.seen || settled, revisiting };
}

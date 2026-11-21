import type { Page } from '@nless/shared/core/types';
import { z } from 'zod';
import { AppError } from './errors';

const cursorSchema = z.object({
  createdAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/),
  id: z.string().uuid(),
}).strict();
type Cursor = z.infer<typeof cursorSchema>;

// pg maps timestamptz to a JS Date, which drops sub-millisecond precision.
export const createdAtForCursor = (column: string) =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt"`;

export function readOpsCursor(cursor: string): Cursor {
  try {
    const bytes = Buffer.from(cursor, 'base64url');
    if (bytes.toString('base64url') !== cursor) throw new Error();
    const value = cursorSchema.parse(JSON.parse(bytes.toString('utf8')));
    if (value.createdAt.startsWith('0000-') || new Date(value.createdAt).toISOString().slice(0, 19) !== value.createdAt.slice(0, 19)) {
      throw new Error();
    }
    return value;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor');
  }
}

export function cursorPage<T extends Cursor, R>(rows: T[], limit: number, project: (row: T) => R): Page<R> {
  const included = rows.slice(0, limit);
  const last = included.at(-1);
  return {
    items: included.map(project),
    nextCursor: last && rows.length > limit
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt, id: last.id })).toString('base64url')
      : null,
  };
}

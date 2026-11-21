import { describe, expect, it } from 'vitest';
import { cursorPage, readOpsCursor } from './ops-page';

describe('operations pagination', () => {
  it('keeps microseconds and the last included id in the next cursor', () => {
    const rows = [
      { id: '00000000-0000-4000-8000-000000000002', createdAt: '2026-11-21T08:00:00.123456Z' },
      { id: '00000000-0000-4000-8000-000000000001', createdAt: '2026-11-21T08:00:00.123455Z' },
    ];
    const page = cursorPage(rows, 1, (row) => ({ ...row, id: row.id }));
    expect(page.items).toEqual([rows[0]]);
    expect(readOpsCursor(page.nextCursor!)).toEqual(rows[0]);
    expect(cursorPage([rows[1]], 1, (row) => row).nextCursor).toBeNull();
  });

  it.each(['not-a-cursor','e30=',''])('rejects a malformed cursor %s', (value) => {
    expect(() => readOpsCursor(value)).toThrow(/invalid cursor/i);
  });

  it.each(['2026-02-31T08:00:00.123456Z', '0000-01-01T08:00:00.000000Z'])(
    'rejects timestamp %s before it can reach PostgreSQL', (createdAt) => {
      const invalid = Buffer.from(JSON.stringify({
        createdAt, id: '00000000-0000-4000-8000-000000000001',
      })).toString('base64url');
      expect(() => readOpsCursor(invalid)).toThrow(/invalid cursor/i);
    },
  );
});

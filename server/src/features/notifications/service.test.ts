import { beforeEach, expect, test, vi } from 'vitest';
import { notify } from './service';

const { query, publish, logError } = vi.hoisted(() => ({ query: vi.fn(), publish: vi.fn(), logError: vi.fn() }));
vi.mock('../../core', () => ({
  db: { query },
  publish,
  log: { warn: vi.fn(), error: logError },
  AppError: class extends Error {
    constructor(public readonly code: string, message?: string) { super(message); }
  },
}));

const businessId = '11111111-1111-4111-8111-111111111111';
const staffId = '22222222-2222-4222-8222-222222222222';
const blockedId = '33333333-3333-4333-8333-333333333333';
const outsiderId = '44444444-4444-4444-8444-444444444444';
const notificationId = '55555555-5555-4555-8555-555555555555';
const input = {
  businessId, type: 'chat.handoff', title: 'Staff requested',
  to: { userIds: [staffId, blockedId, outsiderId, staffId] },
  link: '/chat?c=synthetic', dedupKey: 'handoff:synthetic:v2',
} as const;

beforeEach(() => { query.mockReset(); publish.mockReset(); logError.mockReset(); });

test('publishes only new notification rows to eligible shop recipients across retries', async () => {
  const members = [
    { userId: staffId, role: 'staff', permissions: ['chat.read'] },
    { userId: blockedId, role: 'staff', permissions: ['chat.takeover'] },
  ];
  query.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('INSERT INTO notifications')) {
      expect(params[0]).toBe(businessId);
      expect(params[1]).toEqual([staffId]);
      return { rows: query.mock.calls.filter(([text]) => text.includes('INSERT INTO notifications')).length === 1
        ? [{ id: notificationId, userId: staffId }] : [] };
    }
    expect(params[0]).toBe(businessId);
    expect(params[1]).toEqual([staffId, blockedId, outsiderId]);
    return { rows: members };
  });
  const event = { ...input, to: { userIds: [...input.to.userIds] } };
  expect(await notify(event)).toEqual({ notificationIds: [notificationId], mode: 'real' });
  expect(await notify(event)).toEqual({ notificationIds: [], mode: 'real' });
  expect(publish).toHaveBeenCalledExactlyOnceWith(businessId, {
    type: 'notification.created', userId: staffId, notificationId, title: 'Endless',
  }, { userIds: [staffId] });
});

test.each(['https://evil.example', '//evil.example', '/\\evil.example'])('rejects external link %s before accessing data', async (link) => {
  await expect(notify({ ...input, link, to: { role: 'owners' } })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(query).not.toHaveBeenCalled();
});

test('does not fail the producer when storage is down', async () => {
  query.mockResolvedValueOnce({ rows: [{ userId: staffId, role: 'owner', permissions: [] }] });
  query.mockRejectedValueOnce(new Error('storage unavailable'));
  expect(await notify({ ...input, to: { role: 'owners' } })).toEqual({ notificationIds: [], mode: 'real' });
  expect(publish).not.toHaveBeenCalled();
});


test.each([
  [{ role: 'owners' }, true, null],
  [{ permission: 'chat.takeover' }, false, 'chat.takeover'],
] as const)('carries the original selector into the durable write for %j', async (to, ownersOnly, permission) => {
  query.mockResolvedValueOnce({ rows: [{ userId: staffId, role: 'owner', permissions: [] }] });
  query.mockResolvedValueOnce({ rows: [] });
  await notify({ ...input, to });
  const [sql, args] = query.mock.lastCall!;
  expect(sql).toContain("NOT $9::boolean OR m.role = 'owner'");
  expect(sql).toContain('$10 = ANY(m.permissions)');
  expect(args.slice(8)).toEqual([ownersOnly, permission]);
  expect(publish).not.toHaveBeenCalled();
});

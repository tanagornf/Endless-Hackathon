import { expect, test, vi } from 'vitest';
import { PERMISSIONS } from '@nless/shared/core/permissions';
import { NOTIFICATION_TYPES } from '@nless/shared/features/notifications/types';
import { PREF_DEFAULTS, TYPE_PERMISSION } from './defaults';
import { getNotificationPreference, listPreferences } from './preferences';
import { PreferencesBody } from './schemas';

const { query, maybeOne } = vi.hoisted(() => ({ query: vi.fn(), maybeOne: vi.fn() }));
vi.mock('../../core', () => ({ db: { query, maybeOne }, AppError: Error }));

test('combines defaults with user settings and keeps system enabled in the bell', async () => {
  query.mockResolvedValue({ rows: [
    { type: 'report', inApp: false, push: true },
    { type: 'system', inApp: false, push: false },
  ] });
  const rows = await listPreferences('owner');
  expect(rows).toHaveLength(9);
  expect(rows).toContainEqual({ type: 'report', inApp: false, push: true, forcedInApp: false });
  expect(rows).toContainEqual({ type: 'system', inApp: true, push: false, forcedInApp: true });
  maybeOne.mockResolvedValue(null);
  expect(await getNotificationPreference('owner', 'chat.handoff')).toEqual(
    { type: 'chat.handoff', inApp: true, push: true, forcedInApp: false },
  );
  expect(maybeOne.mock.lastCall?.[1]).toEqual(['owner', 'chat.handoff']);
});

test('rejects duplicate types and disabling the system bell', () => {
  const report = { type: 'report', inApp: true, push: true };
  expect(PreferencesBody.safeParse({ items: [report, report] }).success).toBe(false);
  expect(PreferencesBody.safeParse({ items: [{ ...report, type: 'system', inApp: false }] }).success).toBe(false);
  expect(PreferencesBody.safeParse({ items: [report] }).success).toBe(true);
});


test('all nine types map to supported shop permission keys and notification defaults', () => {
  expect(Object.keys(TYPE_PERMISSION)).toEqual([...NOTIFICATION_TYPES]);
  expect(Object.values(TYPE_PERMISSION).every((key) => Object.hasOwn(PERMISSIONS, key))).toBe(true);
  expect(Object.keys(PREF_DEFAULTS)).toEqual([...NOTIFICATION_TYPES]);
  expect(PREF_DEFAULTS.system.inApp).toBe(true);
});

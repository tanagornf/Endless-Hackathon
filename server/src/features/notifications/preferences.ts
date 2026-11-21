import { NOTIFICATION_TYPES } from '@nless/shared/features/notifications/types';
import type { NotificationType, PreferenceRow } from '@nless/shared/features/notifications/types';
import { db } from '../../core';
import { PREF_DEFAULTS } from './defaults';

type PreferenceValue = Pick<PreferenceRow, 'type' | 'inApp' | 'push'>;

function resolvePreference(type: NotificationType, saved?: PreferenceValue): PreferenceRow {
  const value = saved ?? PREF_DEFAULTS[type];
  const forcedInApp = type === 'system';
  return { type, inApp: forcedInApp || value.inApp, push: value.push, forcedInApp };
}

export async function getNotificationPreference(userId: string, type: NotificationType): Promise<PreferenceRow> {
  const row = await db.maybeOne<PreferenceValue>(
    'SELECT type, in_app AS "inApp", push FROM notification_preferences WHERE user_id = $1 AND type = $2',
    [userId, type],
  );
  return resolvePreference(type, row ?? undefined);
}

export async function listPreferences(userId: string): Promise<PreferenceRow[]> {
  const { rows } = await db.query<PreferenceValue>(
    'SELECT type, in_app AS "inApp", push FROM notification_preferences WHERE user_id = $1', [userId],
  );
  const byType = new Map(rows.map((row) => [row.type, row]));
  return NOTIFICATION_TYPES.map((type) => resolvePreference(type, byType.get(type)));
}

export async function savePreferences(userId: string, items: PreferenceValue[]): Promise<PreferenceRow[]> {
  await db.query(
    'INSERT INTO notification_preferences (user_id, type, in_app, push)'
    + ' SELECT $1, p.type, p."inApp", p.push FROM jsonb_to_recordset($2::jsonb) AS p(type text, "inApp" boolean, push boolean)'
    + ' ON CONFLICT (user_id, type) DO UPDATE SET in_app = excluded.in_app, push = excluded.push, updated_at = now()',
    [userId, JSON.stringify([...items].sort((a, b) => a.type.localeCompare(b.type)))],
  );
  return listPreferences(userId);
}

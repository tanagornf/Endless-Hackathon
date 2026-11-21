import type { MetricsRange } from '@nless/shared/core/types';
import type { FollowUpMetrics, FollowUpSettings } from '@nless/shared/features/follow-ups/types';
import { AppError, auditInTransaction, db } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { defaultSettings, updateSettingsBody } from './config';

type PersistedSettings = Omit<FollowUpSettings, 'timezone'>;
const settingsFields = 'business_id AS "businessId",enabled,delay_hours AS "delayHours",'
  + 'quiet_start AS "quietStart",quiet_end AS "quietEnd",allowed_channels AS "allowedChannels",version';

export async function getSettings(businessId: string): Promise<FollowUpSettings> {
  const [row, { timezone }] = await Promise.all([
    db.maybeOne<PersistedSettings>('SELECT ' + settingsFields + ' FROM follow_up_settings WHERE business_id=$1', [businessId]),
    getBusinessSettings(businessId),
  ]);
  return row ? { ...row, timezone } : { ...defaultSettings, allowedChannels: [...defaultSettings.allowedChannels], businessId, timezone };
}

export async function updateSettings(businessId: string, actorUserId: string, input: unknown): Promise<FollowUpSettings> {
  const parsed = updateSettingsBody.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid follow-up settings');
  const { enabled, delayHours, quietStart, quietEnd, allowedChannels, expectedVersion } = parsed.data;
  const { timezone } = await getBusinessSettings(businessId);
  const row = await db.tx(async (tx) => {
    const updated = await tx.maybeOne<PersistedSettings>(
      'INSERT INTO follow_up_settings (business_id,enabled,delay_hours,quiet_start,quiet_end,allowed_channels,version,updated_by) '
      + 'SELECT $1::uuid,$2::boolean,$3::int,$4::text,$5::text,$6::text[],2,$8::uuid '
      + 'WHERE $7::int=1 OR EXISTS (SELECT 1 FROM follow_up_settings WHERE business_id=$1) '
      + 'ON CONFLICT (business_id) DO UPDATE SET enabled=EXCLUDED.enabled,delay_hours=EXCLUDED.delay_hours,'
      + 'quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,allowed_channels=EXCLUDED.allowed_channels,'
      + 'version=follow_up_settings.version+1,updated_by=EXCLUDED.updated_by,updated_at=now() '
      + 'WHERE follow_up_settings.version=$7 RETURNING ' + settingsFields,
      [businessId, enabled, delayHours, quietStart, quietEnd, allowedChannels, expectedVersion, actorUserId],
    );
    if (!updated) throw new AppError('VERSION_CONFLICT', 'Follow-up settings changed');
    await auditInTransaction(tx, [{
      action: 'follow-ups.settings.update', actorUserId, businessId, targetType: 'business', targetId: businessId,
      details: { enabled, delayHours, quietStart, quietEnd, allowedChannels, version: updated.version },
    }]);
    return updated;
  });
  return { ...row, timezone };
}

export async function getFollowUpMetrics(businessId: string, range: MetricsRange): Promise<FollowUpMetrics> {
  return { scheduled: 0, sent: 0, cancelled: 0, recovered: 0 };
}

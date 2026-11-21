import type { WeeklyHours } from '@nless/shared/core/types';
import type { BusinessProfile } from '@nless/shared/features/business-settings/types';
import { AppError, db } from '../../core';
import type { DbExecutor } from '../../core';
import { DEFAULT_HOURS } from './defaults';
import { BusinessIdSchema } from './schemas';

type SettingsRow = {
  business_status: string;
  account_status: string;
  ai_enabled: boolean | null;
  timezone: string;
  hours: WeeklyHours | null;
  answer_policy: unknown;
  language: 'th' | 'en';
  capabilities: unknown;
  version: number | null;
};

export async function readSettings(businessId: string, ex: DbExecutor = db): Promise<SettingsRow> {
  if (!BusinessIdSchema.safeParse(businessId).success) {
    throw new AppError('NOT_FOUND', 'Business not found');
  }
  return ex.one<SettingsRow>(
    'SELECT b.status AS business_status, a.status AS account_status, b.timezone, b.language, ' +
    's.ai_enabled, s.hours, s.answer_policy, s.capabilities, s.version ' +
    'FROM businesses b JOIN accounts a ON a.id=b.account_id ' +
    'LEFT JOIN business_settings s ON s.business_id=b.id WHERE b.id=$1',
    [businessId],
  );
}

export function readProfile(businessId: string, ex: DbExecutor): Promise<BusinessProfile> {
  return ex.one<BusinessProfile>(
    'SELECT b.name, COALESCE(p.description, \'\') AS description, p.contact_phone AS "contactPhone", ' +
    'p.contact_email AS "contactEmail", p.address FROM businesses b ' +
    'LEFT JOIN business_profiles p ON p.business_id=b.id WHERE b.id=$1',
    [businessId],
  );
}

export async function ensureRow(businessId: string, ex: DbExecutor): Promise<void> {
  await ex.query(
    'INSERT INTO business_settings (business_id, hours) SELECT id, $2::jsonb FROM businesses WHERE id=$1 ' +
    'ON CONFLICT (business_id) DO NOTHING',
    [businessId, JSON.stringify(DEFAULT_HOURS)],
  );
}

export function updateAiSwitch(businessId: string, enabled: boolean, actorUserId: string, ex: DbExecutor) {
  return ex.maybeOne<{ version: number }>(
    'UPDATE business_settings SET ai_enabled=$2, version=version+1, updated_by=$3, updated_at=now() ' +
    'WHERE business_id=$1 AND ai_enabled IS DISTINCT FROM $2 RETURNING version',
    [businessId, enabled, actorUserId],
  );
}

export async function bumpSettingsVersion(businessId: string, actorUserId: string, ex: DbExecutor): Promise<number> {
  await ensureRow(businessId, ex);
  const { version } = await ex.one<{ version: number }>(
    'UPDATE business_settings SET version=version+1, updated_by=$2, updated_at=now() WHERE business_id=$1 RETURNING version',
    [businessId, actorUserId],
  );
  return version;
}

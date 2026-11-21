import type { WeeklyHours } from '@nless/shared/core/types';
import type {
  AnswerPolicy, BusinessClosure, BusinessOpenState, BusinessProfile, BusinessSettings, EffectiveAnswerRules,
  MerchantCapabilities, SettingsView,
} from '@nless/shared/features/business-settings/types';
import { AppError, db, log } from '../../core';
import type { DbExecutor } from '../../core';
import { DEFAULT_CAPABILITIES, DEFAULT_HOURS, RESTRICTIVE_POLICY } from './defaults';
import { resolveRules } from './policy';
import { bumpSettingsVersion, ensureRow, readProfile, readSettings, updateAiSwitch } from './repo';
import { AnswerPolicySchema, CapabilitiesSchema } from './schemas';
import { insertClosure, lockClosures, readClosures, removeClosure } from './closures';
import type { ClosureInput } from './closures';
import { calculateOpenState, localParts, validateWeeklyHours } from './hours';
import { recordSettingsChange } from './settings-audit';

type SettingsRow = Awaited<ReturnType<typeof readSettings>>;

const StoredCapabilitiesSchema = CapabilitiesSchema.partial();
const RESTRICTIVE_CAPABILITIES: MerchantCapabilities = {
  canQuotePrices: false,
  canTakeOrders: false,
  canTakeBookings: false,
  canHandoffToHuman: false,
  canShareContact: false,
};

function parseCapabilities(value: unknown, businessId: string): MerchantCapabilities {
  const parsed = StoredCapabilitiesSchema.safeParse(value ?? {});
  if (parsed.success) return { ...DEFAULT_CAPABILITIES, ...parsed.data };
  log.error({ businessId }, 'Invalid stored business capabilities');
  return { ...RESTRICTIVE_CAPABILITIES };
}

function parsePolicy(policy: unknown, businessId: string): AnswerPolicy | null {
  if (policy === null) return null;
  const parsed = AnswerPolicySchema.safeParse(policy);
  if (parsed.success) return parsed.data;
  log.error({ businessId }, 'Invalid stored business answer policy');
  return RESTRICTIVE_POLICY;
}

function blockedReason(row: SettingsRow): SettingsView['aiBlockedReason'] {
  if (row.business_status !== 'active') return 'business_inactive';
  if (row.account_status !== 'active') return 'account_inactive';
  return null;
}

function toSettings(businessId: string, row: SettingsRow): BusinessSettings {
  return {
    businessId,
    aiEnabled: (row.ai_enabled ?? true) && blockedReason(row) === null,
    timezone: row.timezone,
    hours: row.hours ?? structuredClone(DEFAULT_HOURS),
    answerPolicy: parsePolicy(row.answer_policy, businessId),
    language: row.language,
    version: row.version ?? 1,
  };
}

/**
 * Never null for an existing business. Unknown business returns NOT_FOUND.
 * Read every turn so suspension and the owner switch take effect immediately.
 */
export async function getBusinessSettings(businessId: string): Promise<BusinessSettings> {
  return toSettings(businessId, await readSettings(businessId));
}

export async function getSettingsView(businessId: string, ex: DbExecutor = db): Promise<SettingsView> {
  const row = await readSettings(businessId, ex);
  const settings = toSettings(businessId, row);
  const profile = await readProfile(businessId, ex);
  const capabilities = parseCapabilities(row.capabilities, businessId);

  return {
    settings,
    aiSwitch: row.ai_enabled ?? true,
    aiBlockedReason: blockedReason(row),
    profile,
    capabilities,
    effectiveRules: resolveRules(capabilities, settings.answerPolicy),
  };
}

export async function setAiEnabled(businessId: string, enabled: boolean, actorUserId: string): Promise<SettingsView> {
  const { changed, view } = await db.tx(async (tx) => {
    await ensureRow(businessId, tx);
    const changed = await updateAiSwitch(businessId, enabled, actorUserId, tx);
    return { changed, view: await getSettingsView(businessId, tx) };
  });
  if (changed) {
    await recordSettingsChange(businessId, actorUserId, 'business-settings.ai.toggle', changed.version, {
      from: !enabled, to: enabled,
    });
  }
  return view;
}

export async function ensureBusinessSettings(businessId: string): Promise<BusinessSettings> {
  return getBusinessSettings(businessId);
}

export async function getEffectiveAnswerRules(businessId: string): Promise<EffectiveAnswerRules> {
  const row = await readSettings(businessId);
  return resolveRules(parseCapabilities(row.capabilities, businessId), parsePolicy(row.answer_policy, businessId));
}

export async function getBusinessOpenState(businessId: string, at?: string): Promise<BusinessOpenState> {
  const instant = at === undefined ? new Date() : new Date(at);
  if (!Number.isFinite(instant.getTime())) throw new AppError('VALIDATION_ERROR', 'Invalid opening-state time');
  const settings = await getBusinessSettings(businessId);
  const { date } = localParts(instant, settings.timezone);
  const closures = await readClosures(businessId, date);
  return calculateOpenState(settings.hours, settings.timezone, closures, instant);
}

export async function updateHours(
  businessId: string, actorUserId: string, hours: WeeklyHours, expectedVersion: number,
): Promise<SettingsView> {
  const view = await db.tx(async (tx) => {
    await ensureRow(businessId, tx);
    const { version } = await tx.one<{ version: number }>(
      'SELECT version FROM business_settings WHERE business_id=$1 FOR UPDATE', [businessId],
    );
    if (version !== expectedVersion) {
      throw new AppError('VERSION_CONFLICT', 'Business settings changed', { details: { currentVersion: version } });
    }
    const issues = validateWeeklyHours(hours);
    if (issues.length) throw new AppError('VALIDATION_ERROR', 'Invalid weekly opening hours', { details: { issues } });
    await tx.query(
      'UPDATE business_settings SET hours=$2::jsonb, version=version+1, updated_by=$3, updated_at=now() WHERE business_id=$1',
      [businessId, JSON.stringify(hours), actorUserId],
    );
    return getSettingsView(businessId, tx);
  });
  await recordSettingsChange(businessId, actorUserId, 'business-settings.hours.update', view.settings.version);
  return view;
}

export async function listClosures(businessId: string, scope: 'upcoming' | 'all'): Promise<BusinessClosure[]> {
  const { timezone } = await readSettings(businessId);
  return readClosures(businessId, scope === 'upcoming' ? localParts(new Date(), timezone).date : null);
}

export async function createClosure(businessId: string, actorUserId: string, input: ClosureInput): Promise<BusinessClosure> {
  const result = await db.tx(async (tx) => {
    await lockClosures(businessId, tx);
    const closure = await insertClosure(businessId, actorUserId, input, tx);
    return { closure, version: await bumpSettingsVersion(businessId, actorUserId, tx) };
  });
  const { id: closureId, startDate, endDate } = result.closure;
  await recordSettingsChange(businessId, actorUserId, 'business-settings.closure.create', result.version,
    { closureId, startDate, endDate });
  return result.closure;
}

export async function deleteClosure(businessId: string, actorUserId: string, closureId: string): Promise<void> {
  const version = await db.tx(async (tx) => {
    await lockClosures(businessId, tx);
    await removeClosure(businessId, closureId, tx);
    return bumpSettingsVersion(businessId, actorUserId, tx);
  });
  await recordSettingsChange(businessId, actorUserId, 'business-settings.closure.delete', version, { closureId });
}

export async function getBusinessProfile(businessId: string): Promise<BusinessProfile> {
  throw new AppError('SERVICE_NOT_READY', 'getBusinessProfile is not implemented');
}

export async function getCapabilities(businessId: string): Promise<MerchantCapabilities> {
  throw new AppError('SERVICE_NOT_READY', 'getCapabilities is not implemented');
}

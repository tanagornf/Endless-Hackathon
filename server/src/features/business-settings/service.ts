import type {
  AnswerPolicy, BusinessOpenState, BusinessProfile, BusinessSettings, EffectiveAnswerRules,
  MerchantCapabilities, SettingsView,
} from '@nless/shared/features/business-settings/types';
import { AppError, audit, db, log, publish } from '../../core';
import type { DbExecutor } from '../../core';
import { DEFAULT_CAPABILITIES, DEFAULT_HOURS, RESTRICTIVE_POLICY } from './defaults';
import { resolveRules } from './policy';
import { ensureRow, readProfile, readSettings, updateAiSwitch } from './repo';
import { AnswerPolicySchema, CapabilitiesSchema } from './schemas';

type SettingsRow = Awaited<ReturnType<typeof readSettings>>;

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
  const storedCapabilities = CapabilitiesSchema.partial().safeParse(row.capabilities ?? {});
  const capabilities = { ...DEFAULT_CAPABILITIES, ...(storedCapabilities.success ? storedCapabilities.data : {}) };

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
    await audit({
      action: 'business-settings.ai.toggle',
      businessId,
      actorUserId,
      targetType: 'business',
      targetId: businessId,
      details: { from: !enabled, to: enabled },
    });
    publish(businessId, {
      type: 'custom',
      featureId: 'F04',
      name: 'business-settings.changed',
      data: { version: changed.version },
    });
  }
  return view;
}

export async function ensureBusinessSettings(businessId: string): Promise<BusinessSettings> {
  return getBusinessSettings(businessId);
}

export async function getEffectiveAnswerRules(businessId: string): Promise<EffectiveAnswerRules> {
  throw new AppError('SERVICE_NOT_READY', 'getEffectiveAnswerRules is not implemented');
}

export async function getBusinessOpenState(businessId: string, at?: string): Promise<BusinessOpenState> {
  throw new AppError('SERVICE_NOT_READY', 'getBusinessOpenState is not implemented');
}

export async function getBusinessProfile(businessId: string): Promise<BusinessProfile> {
  throw new AppError('SERVICE_NOT_READY', 'getBusinessProfile is not implemented');
}

export async function getCapabilities(businessId: string): Promise<MerchantCapabilities> {
  throw new AppError('SERVICE_NOT_READY', 'getCapabilities is not implemented');
}

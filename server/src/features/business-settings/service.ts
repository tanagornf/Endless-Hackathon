import { AppError } from '../../core';
import { SEED } from '@nless/shared/core/fixtures';
import type { BusinessOpenState, BusinessProfile, BusinessSettings, EffectiveAnswerRules, MerchantCapabilities } from '@nless/shared/features/business-settings/types';

/**
 * @owner F04 business-settings · C3 · consumers: B2 (ai.reply gate, policy), C2, A3 (hours), B1
 * Never null for an existing business (defaults when no row). Unknown business → NOT_FOUND.
 * @fake SEED.businesses[].settings + timezone, answerPolicy null, version 1. Both seed businesses aiEnabled true.
 */
export async function getBusinessSettings(businessId: string): Promise<BusinessSettings> {
  const business = SEED.businesses.find((candidate) => candidate.id === businessId);
  if (!business) throw new AppError('NOT_FOUND', 'Business not found');
  return { businessId, ...business.settings, timezone: business.timezone, answerPolicy: null, version: 1 };
}

/**
 * @owner F04 business-settings · C3 · consumers: C3 F03 tenancy (onboarding, right after a business is created), seeds
 * Creates the business_settings row (+ profile row) with DEFAULTS when missing; idempotent. Unknown business → NOT_FOUND.
 * @fake getBusinessSettings(businessId) (SEED values, no write).
 */
export async function ensureBusinessSettings(businessId: string): Promise<BusinessSettings> {
  return getBusinessSettings(businessId);
}

/**
 * @owner F04 business-settings · C3 · consumers: B2 F10 (tool gating + directives), A3 F15 (booking enabled)
 * capability ∩ answerPolicy, deny wins. Never null. Unknown business → NOT_FOUND.
 * @fake all permissive: price / stock / contact 'always', generalKnowledge, booking, orders, handoff true.
 */
export async function getEffectiveAnswerRules(businessId: string): Promise<EffectiveAnswerRules> {
  throw new AppError("SERVICE_NOT_READY", "getEffectiveAnswerRules is not implemented");
}

/**
 * @owner F04 business-settings · C3 · consumers: B2 F10 (optional "closed today" hint), A3 F15/F16, C2
 * Open or closed at `at` (default now) in the business timezone, from weekly hours + closures. Unknown business → NOT_FOUND.
 * @fake { open: true, reason: 'open', timezone: 'Asia/Bangkok', nextOpenAt: null, closure: null, localDate / localTime from `at` }.
 */
export async function getBusinessOpenState(businessId: string, at?: string): Promise<BusinessOpenState> {
  throw new AppError("SERVICE_NOT_READY", "getBusinessOpenState is not implemented");
}

/**
 * @owner F04 business-settings · C3 · consumer: B2 F10 (only when rules.contact === 'always'). Unknown business → NOT_FOUND.
 * @fake { name from SEED.businesses, description: '', contactPhone: null, contactEmail: null, address: null }.
 */
export async function getBusinessProfile(businessId: string): Promise<BusinessProfile> {
  throw new AppError("SERVICE_NOT_READY", "getBusinessProfile is not implemented");
}

/** @owner F04 business-settings · C3. Stored capabilities with defaults filled. Unknown business → NOT_FOUND. @fake all five true. */
export async function getCapabilities(businessId: string): Promise<MerchantCapabilities> {
  throw new AppError("SERVICE_NOT_READY", "getCapabilities is not implemented");
}

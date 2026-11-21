import { AppError } from '../../core';
import type { CustomerProfile, CustomerSummary, TagSummary } from '@nless/shared/features/crm/types';
import type { Page } from '@nless/shared/core/types';

/**
 * @owner F24 crm · A3 · consumers: A1 broadcast, B3 insights, B2 ai-agent, A2
 * Identity row is the core `customers` table (written by inbox saveMessage); F24 keeps profile/tags/marketing consent
 * (broadcast opt-out) in its own tables keyed by customer id. Null when missing/other business (R3).
 * @fake core customers row + SEED.tags/consent; contact all null, note null.
 */
export async function getCustomer(businessId: string, customerId: string): Promise<CustomerProfile | null> {
  throw new AppError("SERVICE_NOT_READY", "getCustomer is not implemented");
}

/**
 * @owner F24 crm · A3. Customers having ANY of tagIds. opts.requireConsent 'granted' drops revoked/unknown
 * (broadcast must still re-check consent at send time).
 * @fake SEED.tags × SEED.customers: tag_vip_a → A Customer One (granted) + A Customer Two (revoked).
 */
export async function listCustomersByTags(
  businessId: string,
  tagIds: string[],
  opts?: { cursor?: string | null; limit?: number; requireConsent?: 'granted' },
): Promise<Page<CustomerSummary>> {
  throw new AppError("SERVICE_NOT_READY", "listCustomersByTags is not implemented");
}

/**
 * @owner F24 crm · A3 · consumer: A1 F23 broadcast (audience picker, validation of tag ids)
 * Every tag of the business, sorted by name; customerCount excludes deleted customers.
 * @fake tags derived from SEED customers of that business (id = name).
 */
export async function listTags(businessId: string): Promise<TagSummary[]> {
  return [];
}

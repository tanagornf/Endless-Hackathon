import type { CustomerProfile, CustomerSummary, TagSummary } from '@nless/shared/features/crm/types';
import type { Page } from '@nless/shared/core/types';
import { audience, profile, tags } from './repo';
export { setMarketingConsent, addInferredTag } from './mutations';

export async function getCustomer(businessId: string, customerId: string): Promise<CustomerProfile | null> {
  return profile(businessId, customerId);
}
export async function listCustomersByTags(businessId: string, tagIds: string[], opts?: {
  cursor?: string | null; limit?: number; requireConsent?: 'granted';
}): Promise<Page<CustomerSummary>> {
  return audience(businessId, tagIds, opts);
}
export async function listTags(businessId: string): Promise<TagSummary[]> {
  return (await tags(businessId)).map(({ id, name, customerCount }) => ({ id, name, customerCount }));
}

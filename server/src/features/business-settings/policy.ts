import type { AnswerPolicy, AnswerPolicyPatch, EffectiveAnswerRules, MerchantCapabilities } from '@nless/shared/features/business-settings/types';

export function resolveRules(capabilities: MerchantCapabilities, policy: AnswerPolicy | null): EffectiveAnswerRules {
  const price = capabilities.canQuotePrices ? policy?.price?.reveal ?? 'always' : 'never';
  return {
    price,
    stock: policy?.stock?.reveal ?? 'always',
    contact: capabilities.canShareContact ? policy?.contact?.reveal ?? 'always' : 'never',
    generalKnowledge: policy?.generalKnowledge !== false,
    booking: capabilities.canTakeBookings && policy?.booking?.enabled !== false,
    orders: capabilities.canTakeOrders && price === 'always',
    handoff: capabilities.canHandoffToHuman,
  };
}


export function normalizePolicy(policy: AnswerPolicy): AnswerPolicy | null {
  const compact = { ...policy };
  if (compact.price?.reveal === 'always') delete compact.price;
  if (compact.stock?.reveal === 'always') delete compact.stock;
  if (compact.contact?.reveal === 'always') delete compact.contact;
  if (compact.generalKnowledge === true) delete compact.generalKnowledge;
  if (compact.booking?.enabled === true) delete compact.booking;
  return Object.keys(compact).length ? compact : null;
}

export function mergePolicy(current: AnswerPolicy | null, patch: AnswerPolicyPatch | null): AnswerPolicy | null {
  if (patch === null) return null;
  const updated = Object.fromEntries(Object.entries({ ...current, ...patch }).filter(([, value]) => value != null));
  return normalizePolicy(updated);
}

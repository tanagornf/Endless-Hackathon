import type { AnswerPolicy, EffectiveAnswerRules, MerchantCapabilities } from '@nless/shared/features/business-settings/types';

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

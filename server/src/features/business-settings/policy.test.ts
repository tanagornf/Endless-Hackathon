import { describe, expect, it } from 'vitest';
import type { AnswerPolicy, EffectiveAnswerRules, MerchantCapabilities } from '@nless/shared/features/business-settings/types';
import { resolveRules } from './policy';

const permissiveCaps: MerchantCapabilities = {
  canQuotePrices: true,
  canTakeOrders: true,
  canTakeBookings: true,
  canHandoffToHuman: true,
  canShareContact: true,
};
const permissiveRules: EffectiveAnswerRules = {
  price: 'always',
  stock: 'always',
  contact: 'always',
  generalKnowledge: true,
  booking: true,
  orders: true,
  handoff: true,
};

const cases: {
  name: string;
  caps: Partial<MerchantCapabilities>;
  policy: AnswerPolicy | null;
  expected: Partial<EffectiveAnswerRules>;
}[] = [
  { name: 'defaults allow all supported actions', caps: {}, policy: null, expected: {} },
  { name: 'capability denial wins over an allow policy', caps: { canQuotePrices: false },
    policy: { price: { reveal: 'always' } }, expected: { price: 'never', orders: false } },
  { name: 'policy denial wins over an allowed capability', caps: {},
    policy: { price: { reveal: 'never' } }, expected: { price: 'never', orders: false } },
  { name: 'staff-only price disables order proposals', caps: {},
    policy: { price: { reveal: 'ask_staff' } }, expected: { price: 'ask_staff', orders: false } },
  { name: 'disabled order capability keeps orders off even with public prices', caps: { canTakeOrders: false },
    policy: null, expected: { orders: false } },
  { name: 'booking capability denial wins', caps: { canTakeBookings: false },
    policy: { booking: { enabled: true } }, expected: { booking: false } },
  { name: 'booking, stock and general knowledge honor policy denials', caps: {},
    policy: { booking: { enabled: false }, stock: { reveal: 'ask_staff' }, generalKnowledge: false },
    expected: { booking: false, stock: 'ask_staff', generalKnowledge: false } },
  { name: 'contact and handoff honor capability denials', caps: { canShareContact: false, canHandoffToHuman: false },
    policy: { contact: { reveal: 'always' } }, expected: { contact: 'never', handoff: false } },
];

describe('F04 capability and policy intersection', () => {
  it.each(cases)('$name', ({ caps, policy, expected }) => {
    expect(resolveRules({ ...permissiveCaps, ...caps }, policy)).toEqual({ ...permissiveRules, ...expected });
  });
});

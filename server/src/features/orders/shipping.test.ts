import { describe, expect, it } from 'vitest';
import { SEED, SEED_CHECKS } from '@nless/shared/core/fixtures';
import type { ShippingRule } from '@nless/shared/core/types';
import { computeShipping } from './shipping';

const shopA = SEED.businesses.find(business => business.alias === 'biz_demo_a')!.shipping;
const shopB = SEED.businesses.find(business => business.alias === 'biz_demo_b')!.shipping;

describe('order shipping in satang', () => {
  it.each(SEED_CHECKS)('quotes the seeded $sku × $quantity order', order => {
    const rule = SEED.businesses.find(business => business.alias === order.business)!.shipping;
    const fee = computeShipping(rule, order.subtotalMinor, 'shipping');
    expect(fee).toBe(order.deliveryFeeMinor);
    expect(order.subtotalMinor + fee).toBe(order.totalMinor);
  });

  it.each([
    { subtotal: 149_000, fee: 10_000, total: 159_000 },
    { subtotal: 208_400, fee: 0, total: 208_400 },
    { subtotal: 199_999, fee: 10_000, total: 209_999 },
    { subtotal: 200_000, fee: 0, total: 200_000 },
  ])('charges $fee on a subtotal of $subtotal', ({ subtotal, fee, total }) => {
    const actualFee = computeShipping(shopA, subtotal, 'shipping');
    expect(actualFee).toBe(fee);
    expect(subtotal + actualFee).toBe(total);
  });

  it.each([shopA, shopB])('waives the $kind fee for pickup', rule => {
    expect(computeShipping(rule, 19_800, 'pickup')).toBe(0);
  });

  it.each([-1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid subtotal %s', subtotal => {
    expect(() => computeShipping(shopA, subtotal, 'shipping')).toThrowError(/subtotal/);
  });

  const invalidRules: ShippingRule[] = [
    { kind: 'flat', feeMinor: -1 },
    { kind: 'flat', feeMinor: 0.5 },
    { kind: 'flat', feeMinor: 10_000_001 },
    { kind: 'threshold', feeMinor: 0, freeFromSubtotalMinor: 0 },
    { kind: 'threshold', feeMinor: 0, freeFromSubtotalMinor: 2.5 },
  ];
  it.each(invalidRules)('rejects invalid rule %o', rule => {
    expect(() => computeShipping(rule, 100, 'shipping')).toThrowError(/Invalid/);
  });

  it('rejects overflow only when the fee is charged', () => {
    expect(() => computeShipping(shopB, Number.MAX_SAFE_INTEGER, 'shipping')).toThrowError(/total/);
    expect(computeShipping(shopB, Number.MAX_SAFE_INTEGER, 'pickup')).toBe(0);
  });
});

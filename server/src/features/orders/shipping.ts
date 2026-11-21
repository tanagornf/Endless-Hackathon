import type { ShippingRule } from '@nless/shared/core/types';
import { AppError } from '../../core/errors';

export function computeShipping(
  rule: ShippingRule,
  subtotalMinor: number,
  deliveryMethod: 'shipping' | 'pickup',
): number {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) {
    throw new AppError('VALIDATION_ERROR', 'Invalid order subtotal');
  }
  if (!Number.isSafeInteger(rule.feeMinor) || rule.feeMinor < 0 || rule.feeMinor > 10_000_000) {
    throw new AppError('VALIDATION_ERROR', 'Invalid shipping fee');
  }
  if (rule.kind === 'threshold') {
    if (!Number.isSafeInteger(rule.freeFromSubtotalMinor) || rule.freeFromSubtotalMinor <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Invalid free shipping threshold');
    }
    if (subtotalMinor >= rule.freeFromSubtotalMinor) return 0;
  }
  if (deliveryMethod === 'pickup') return 0;
  if (!Number.isSafeInteger(subtotalMinor + rule.feeMinor)) {
    throw new AppError('VALIDATION_ERROR', 'Order total exceeds the safe integer range');
  }
  return rule.feeMinor;
}

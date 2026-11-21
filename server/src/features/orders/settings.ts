import { z } from 'zod';
import type { ShippingRule } from '@nless/shared/core/types';
import { AppError, auditInTransaction, db } from '../../core';
import type { OrderSettingsView } from '@nless/shared/features/orders/types';

export const updateSettingsBody = z.strictObject({
  expectedVersion: z.number().int().nonnegative(),
  enabled: z.boolean(),
  shippingKind: z.enum(['flat', 'threshold']),
  shippingFeeBaht: z.number().min(0).max(100000).multipleOf(0.01),
  freeFromSubtotalBaht: z.number().min(0.01).max(10000000).multipleOf(0.01).nullable(),
  pickupEnabled: z.boolean(),
  proposalTtlMinutes: z.number().int().min(5).max(120),
  orderExpiryDays: z.number().int().min(1).max(60),
}).refine(input => (input.shippingKind === 'threshold') === (input.freeFromSubtotalBaht !== null),
  { path: ['freeFromSubtotalBaht'], message: 'Only threshold shipping takes a free shipping threshold' });

const columns = `business_id AS "businessId", enabled, shipping_kind AS "shippingKind",
  shipping_fee_minor AS "shippingFeeMinor", free_from_subtotal_minor AS "freeFromSubtotalMinor",
  pickup_enabled AS "pickupEnabled", proposal_ttl_minutes AS "proposalTtlMinutes",
  order_expiry_days AS "orderExpiryDays", version`;

export async function getOrderSettings(businessId: string): Promise<OrderSettingsView> {
  const row = await db.maybeOne<OrderSettingsView>(`SELECT ${columns} FROM order_settings WHERE business_id=$1`, [businessId]);
  return row ?? { businessId, enabled: true, shippingKind: 'flat', shippingFeeMinor: 0, freeFromSubtotalMinor: null,
    pickupEnabled: true, proposalTtlMinutes: 15, orderExpiryDays: 7, version: 0 };
}

export function shippingRule(settings: OrderSettingsView): ShippingRule {
  if (settings.shippingKind === 'flat') return { kind: 'flat', feeMinor: settings.shippingFeeMinor };
  return { kind: 'threshold', feeMinor: settings.shippingFeeMinor, freeFromSubtotalMinor: settings.freeFromSubtotalMinor! };
}

export async function updateOrderSettings(businessId: string, actorUserId: string, input: z.infer<typeof updateSettingsBody>) {
  return db.tx(async tx => {
    const values = [businessId, input.enabled, input.shippingKind, Math.round(input.shippingFeeBaht * 100),
      input.freeFromSubtotalBaht === null ? null : Math.round(input.freeFromSubtotalBaht * 100), input.pickupEnabled,
      input.proposalTtlMinutes, input.orderExpiryDays, actorUserId];
    const changed = input.expectedVersion === 0
      ? await tx.maybeOne<OrderSettingsView>(`INSERT INTO order_settings (business_id, enabled, shipping_kind, shipping_fee_minor,
          free_from_subtotal_minor, pickup_enabled, proposal_ttl_minutes, order_expiry_days, updated_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (business_id) DO NOTHING RETURNING ${columns}`, values)
      : await tx.maybeOne<OrderSettingsView>(`UPDATE order_settings SET enabled=$2, shipping_kind=$3, shipping_fee_minor=$4,
          free_from_subtotal_minor=$5, pickup_enabled=$6, proposal_ttl_minutes=$7, order_expiry_days=$8, updated_by=$9,
          updated_at=now(), version=version+1 WHERE business_id=$1 AND version=$10 RETURNING ${columns}`, [...values, input.expectedVersion]);
    if (!changed) {
      const current = await tx.maybeOne<{ version: number }>('SELECT version FROM order_settings WHERE business_id=$1', [businessId]);
      throw new AppError('VERSION_CONFLICT', 'Order settings changed', { details: { currentVersion: current?.version ?? 0 } });
    }
    await auditInTransaction(tx, [{ action: 'orders.settings.update', businessId, actorUserId, targetType: 'order_settings',
      targetId: businessId, details: { version: changed.version } }]);
    return changed;
  });
}

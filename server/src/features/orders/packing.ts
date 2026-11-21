import { z } from 'zod';
import type { PackingOrder, PackingUpdate } from '@nless/shared/features/orders/packing';
import { AppError, auditInTransaction, db } from '../../core';

export const packingDay = z.object({ day: z.iso.date() });
const field = (max: number) => z.string().trim().max(max).optional();
export const packingUpdate = z.strictObject({
  expectedVersion: z.number().int().positive(),
  shipByAt: z.string().datetime({ offset: true }).nullable(),
  address: z.strictObject({ name: field(180), phone: field(50), line1: field(500), line2: field(500),
    district: field(180), province: field(180), postalCode: field(30) }),
});
const pending = "delivery_method='shipping' AND status IN ('awaiting_payment','paid','preparing')";

export async function packingList(businessId: string, day: string) {
  const result = await db.query<PackingOrder>(`
    SELECT o.id, o.order_number AS number, o.status, o.version, o.shipping_address AS address,
      to_char(o.ship_by_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "shipByAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('sku',i.sku,'name',i.name,'quantity',i.quantity) ORDER BY i.line_no)
        FROM order_items i WHERE i.business_id=o.business_id AND i.order_id=o.id),'[]') AS items
    FROM orders o WHERE o.business_id=$1 AND ${pending}
      AND (o.ship_by_at IS NULL OR o.ship_by_at < (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Bangkok'))
    ORDER BY o.ship_by_at NULLS LAST,o.order_number,o.id`, [businessId,day]);
  return { day, items: result.rows };
}

export async function updatePacking(businessId: string, actorUserId: string, id: string, input: PackingUpdate) {
  return db.tx(async tx => {
    const current = await tx.maybeOne<{ version: number }>(`SELECT version FROM orders WHERE business_id=$1 AND id=$2 AND ${pending} FOR UPDATE`,
      [businessId,id]);
    if (!current) throw new AppError('NOT_FOUND','Pending shipment not found');
    if (current.version !== input.expectedVersion) throw new AppError('VERSION_CONFLICT','Order changed. Reload before editing.');
    const row = await tx.one<{ version: number }>(`UPDATE orders SET ship_by_at=$3,
      shipping_address=COALESCE(shipping_address,'{}'::jsonb) || $4::jsonb,updated_at=now(),version=version+1
      WHERE business_id=$1 AND id=$2 RETURNING version`, [businessId,id,input.shipByAt,JSON.stringify(input.address)]);
    await auditInTransaction(tx,[{ action:'orders.packing.update',businessId,actorUserId,targetType:'order',
      targetId:id,details:{ version:row.version } }]);
    return row;
  });
}

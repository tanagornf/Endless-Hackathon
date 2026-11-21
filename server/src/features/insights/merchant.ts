import type { MerchantReport } from '@nless/shared/features/insights/merchant';
import { db } from '../../core';

// One snapshot across chats and orders. A mention is a catalog-backed reply,
// and a conversion here means that same chat ordered the same SKU in the reporting period.
export async function merchantReport(businessId: string, days: number): Promise<MerchantReport> {
  return db.one<MerchantReport>(`
    WITH bounds AS (
      SELECT now() AS stop, ((now() AT TIME ZONE 'Asia/Bangkok')::date - ($2::int - 1))::timestamp
        AT TIME ZONE 'Asia/Bangkok' AS start
    ), chats AS (
      SELECT DISTINCT c.id, c.customer_id
      FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.business_id=m.business_id, bounds
      WHERE m.business_id=$1 AND m.direction='inbound' AND m.author='customer' AND m.origin='live'
        AND m.created_at >= start AND m.created_at < stop
    ), turns AS (
      SELECT t.* FROM ai_turns t JOIN chats c ON c.id=t.conversation_id
      JOIN messages m ON m.id=t.inbound_message_id AND m.business_id=t.business_id, bounds
      WHERE t.business_id=$1 AND t.mode='reply' AND m.origin='live'
        AND m.created_at >= start AND m.created_at < stop
    ), purchases AS (
      SELECT o.id,o.conversation_id FROM orders o JOIN chats c ON c.id=o.conversation_id, bounds
      WHERE o.business_id=$1 AND o.status <> 'cancelled' AND o.created_at >= start AND o.created_at < stop
    ), bought AS (
      SELECT DISTINCT p.conversation_id,i.sku FROM purchases p
      JOIN order_items i ON i.business_id=$1 AND i.order_id=p.id
    ), mentions AS (
      SELECT DISTINCT ON (t.conversation_id,ref->>'sku') t.conversation_id,ref->>'sku' AS sku,ref->>'name' AS name,t.finished_at
      FROM turns t CROSS JOIN LATERAL jsonb_array_elements(t.product_refs) ref
      WHERE t.state='completed' AND NULLIF(ref->>'sku','') IS NOT NULL
      ORDER BY t.conversation_id,ref->>'sku',t.finished_at DESC,t.id DESC
    ), ranked AS (
      SELECT m.sku,(array_agg(COALESCE(NULLIF(m.name,''),m.sku) ORDER BY m.finished_at DESC,m.conversation_id))[1] AS name,
        count(*)::int AS conversations,count(*) FILTER (WHERE b.sku IS NULL)::int AS "withoutOrder"
      FROM mentions m LEFT JOIN bought b USING(conversation_id,sku)
      GROUP BY m.sku ORDER BY "withoutOrder" DESC,conversations DESC,m.sku LIMIT 10
    )
    SELECT to_char(start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS since,
      to_char(stop AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"') AS until,
      (SELECT count(*)::int FROM chats) AS conversations,
      (SELECT count(DISTINCT customer_id)::int FROM chats) AS customers,
      (SELECT count(*)::int FROM purchases) AS orders,
      (SELECT count(DISTINCT conversation_id)::int FROM turns WHERE escalated) AS handoffs,
      COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r."withoutOrder" DESC,r.conversations DESC,r.sku) FROM ranked r),'[]') AS products
    FROM bounds`, [businessId, days]);
}

import { z } from 'zod';
import type { MetricsRange } from '@nless/shared/core/types';
import type { OrderMetrics, OrderSummary } from '@nless/shared/features/orders/types';
import { AppError, auditInTransaction, db, type DbExecutor } from '../../core';
import { getConversation } from '../inbox/service';
export type StoredOrder = OrderSummary & {
  orderNumber: string;
  proposalId: string | null;
  customerId: string | null;
  deliveryMethod: 'shipping' | 'pickup';
};
const columns = `o.id,o.business_id AS "businessId",o.conversation_id AS "conversationId",o.status,o.payment_state AS "paymentState",
 o.subtotal_minor::float8 AS "subtotalMinor",o.delivery_fee_minor::float8 AS "deliveryFeeMinor",o.total_minor::float8 AS "totalMinor",
 o.currency,o.version,o.created_at AS "createdAt",o.order_number AS "orderNumber",o.proposal_id AS "proposalId",
 o.customer_id AS "customerId",o.delivery_method AS "deliveryMethod",
 COALESCE((SELECT jsonb_agg(jsonb_build_object('itemId',i.item_id,'variantId',i.variant_id,'sku',i.sku,'name',i.name,
  'quantity',i.quantity,'unitPriceMinor',i.unit_price_minor,'lineTotalMinor',i.line_total_minor) ORDER BY i.line_no)
  FROM order_items i WHERE i.order_id=o.id AND i.business_id=o.business_id),'[]') AS lines`;
type Row = Omit<StoredOrder, 'createdAt'> & {
  createdAt: Date;
};
const view = (row: Row): StoredOrder => ({ ...row, createdAt: row.createdAt.toISOString() });
export async function getOrder(businessId: string, orderId: string, ex: DbExecutor = db, lock = false): Promise<StoredOrder> {
  const row = await ex.maybeOne<Row>(`SELECT ${columns} FROM orders o WHERE o.business_id=$1 AND o.id=$2` + (lock ? ' FOR UPDATE OF o' : ''), [businessId, orderId]);
  if (!row)
    throw new AppError('NOT_FOUND', 'Order not found');
  return view(row);
}
export function lockOrderForPayment(businessId: string, orderId: string, tx: DbExecutor) {
  return getOrder(businessId, orderId, tx, true);
}
export async function getOrderForPayment(businessId: string, orderId: string) {
  const order = await getOrder(businessId, orderId);
  const conversation = order.conversationId ? await getConversation(order.conversationId, { businessId }) : null;
  return { id: order.id, orderNumber: order.orderNumber, status: order.status, paymentState: order.paymentState,
    totalMinor: order.totalMinor, version: order.version, conversationId: order.conversationId, customerId: order.customerId,
    customerName: conversation?.customer.displayName ?? '' };
}
const instant = z.string().datetime({ offset: true });
export async function getOrderMetrics(businessId: string, range: MetricsRange): Promise<OrderMetrics> {
  if (!instant.safeParse(range.from).success || !instant.safeParse(range.to).success || Date.parse(range.from) >= Date.parse(range.to))
    throw new AppError('VALIDATION_ERROR', 'Invalid metrics range');
  return db.one<OrderMetrics>(`SELECT count(*) FILTER (WHERE created_at >=$2 AND created_at <$3)::int AS "ordersCreated",
  count(*) FILTER (WHERE created_at >=$2 AND created_at <$3 AND origin='ai')::int AS "ordersFromChat",
  count(*) FILTER (WHERE paid_at >=$2 AND paid_at <$3 AND payment_state='paid')::int AS "ordersPaid",
  COALESCE(sum(total_minor) FILTER (WHERE paid_at >=$2 AND paid_at <$3 AND payment_state='paid'),0)::float8 AS "revenueMinor"
  FROM orders WHERE business_id=$1`, [businessId, range.from, range.to]);
}
export async function listOrdersByCustomer(businessId: string, customerId: string, opts?: {
  since?: string;
  limit?: number;
}): Promise<OrderSummary[]> {
  const limit = opts?.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || (opts?.since !== undefined && !instant.safeParse(opts.since).success))
    throw new AppError('VALIDATION_ERROR', 'Invalid order list filter');
  const { rows } = await db.query<Row>(`SELECT ${columns} FROM orders o WHERE o.business_id=$1 AND o.customer_id=$2
  AND ($3::timestamptz IS NULL OR o.created_at >=$3) ORDER BY o.created_at DESC,o.id DESC LIMIT $4`, [businessId, customerId, opts?.since ?? null, Math.min(limit, 100)]);
  return rows.map(view);
}
export type OrderActor = {
  kind: 'customer' | 'staff' | 'system';
  userId?: string | null;
};
type Hook = (order: OrderSummary & {
  orderNumber: string;
  proposalId: string | null;
}, ctx: {
  actor: OrderActor;
}) => Promise<void>;
const hooks: Record<'confirmed' | 'paid' | 'cancelled', Map<Hook, 'payment' | 'observer'>> = { confirmed: new Map(), paid: new Map(), cancelled: new Map() };
export function registerOrderHook(name: keyof typeof hooks, fn: Hook, role: 'payment' | 'observer' = 'payment') {
  hooks[name].set(fn, role);
  return () => { hooks[name].delete(fn); };
}
export function registeredHooks(name: keyof typeof hooks) { return [...hooks[name].entries()]; }
type PaymentTarget = 'pending_verification' | 'unpaid' | 'paid';
export async function setPaymentState(input: {
  businessId: string;
  orderId: string;
  to: PaymentTarget;
  actor: OrderActor;
  tx?: DbExecutor;
}) {
  const transition = async (tx: DbExecutor) => {
    const { businessId, orderId, to, actor } = input;
    const row = await tx.maybeOne<{
      status: string;
      payment_state: string;
    }>('SELECT status,payment_state FROM orders WHERE business_id=$1 AND id=$2 FOR UPDATE', [businessId, orderId]);
    if (!row)
      throw new AppError('NOT_FOUND', 'Order not found');
    if (row.status !== 'awaiting_payment')
      throw new AppError('POLICY_BLOCKED', 'Order is not payable', { details: { reason: 'order_not_payable' } });
    const permitted = row.payment_state === 'unpaid' ? ['pending_verification', 'paid'] : ['unpaid', 'paid'];
    if (!permitted.includes(to))
      throw new AppError('POLICY_BLOCKED', 'Illegal payment transition', { details: { reason: 'illegal_transition' } });
    const status = to === 'paid' ? 'paid' : 'awaiting_payment';
    await tx.query(`UPDATE orders SET status=$3,payment_state=$4,version=version+1,updated_at=now(),
   paid_at=CASE WHEN $4='paid' THEN now() ELSE paid_at END WHERE business_id=$1 AND id=$2`, [businessId, orderId, status, to]);
    await tx.query(`INSERT INTO order_events (business_id,order_id,action,from_status,to_status,from_payment,to_payment,actor_kind,actor_user_id)
   VALUES ($1,$2,'order.payment',$3,$4,$5,$6,$7,$8)`, [businessId, orderId, row.status, status, row.payment_state, to, actor.kind, actor.userId ?? null]);
    await auditInTransaction(tx, [{ action: 'orders.order.payment', businessId, actorUserId: actor.userId ?? null, targetType: 'order', targetId: orderId, details: { from: row.payment_state, to } }]);
    return getOrder(businessId, orderId, tx);
  };
  return input.tx ? transition(input.tx) : db.tx(transition);
}

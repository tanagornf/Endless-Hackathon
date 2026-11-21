import { formatMoneyText } from '@nless/shared/core/language';
import { AppError, audit, db, jobs, sendToCustomer, type JobContext } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { getConversation, getCustomerLanguage, getHistory } from '../inbox/service';
import { notify } from '../notifications/service';
import { getOrder, registeredHooks, type StoredOrder, type OrderActor } from './order-repo';
type State = 'pending' | 'done' | 'failed';
type Work = {
  id: string;
  kind: 'confirmation' | 'payment_request' | 'staff_notify';
  state: State;
  payment_fallback_required: boolean | null;
};
async function delivered(order: StoredOrder, text: string, key: string): Promise<boolean> {
  if (!order.conversationId)
    return true;
  const sent = await sendToCustomer(order.conversationId, [{ type: 'text', text }], { author: 'ai', origin: 'system', businessId: order.businessId, clientRequestId: key + order.id });
  const delivery = await jobs.get(sent.jobId);
  if (delivery?.state === 'succeeded') {
    let before: string | null = null;
    do {
      const page = await getHistory(order.conversationId, { businessId: order.businessId, before, limit: 100 });
      const row = page.items.find(message => message.id === sent.messageId);
      if (row?.delivery.state === 'sent')
        return true;
      if (row)
        break;
      before = page.nextCursor;
    } while (before);
    throw new AppError('CHANNEL_NOT_CONNECTED', 'Customer message was not delivered', { retryable: true });
  }
  if (!delivery || ['failed', 'dead', 'cancelled'].includes(delivery.state)) {
    throw new AppError('CHANNEL_NOT_CONNECTED', 'Order message delivery failed', { retryable: true });
  }
  return false;
}
async function processWork(work: Work, order: StoredOrder, actor: OrderActor) {
  const { kind } = work;
  const { businessId, conversationId } = order;
  if (kind === 'staff_notify') {
    const settings = await getBusinessSettings(businessId);
    const conversation = conversationId ? await getConversation(conversationId, { businessId }) : null;
    await notify({ businessId, type: 'order.created', to: { permission: 'orders.read' }, title: (settings.language === 'en' ? 'New order ' : 'ออเดอร์ใหม่ ') + order.orderNumber,
      body: [conversation?.customer.displayName, formatMoneyText(order.totalMinor, settings.language)].filter(Boolean).join(' · '),
      link: '/orders?o=' + order.id, dedupKey: 'order.created:' + order.id });
    return true;
  }
  if (!conversationId)
    return true;
  const lang = await getCustomerLanguage(conversationId, { businessId });
  if (kind === 'confirmation') {
    const amount = formatMoneyText(order.totalMinor, lang);
    const title = lang === 'en' ? 'Thank you. We have received order ' + order.orderNumber + '. Total ' + amount + '.'
      : 'ขอบคุณค่ะ รับออเดอร์ ' + order.orderNumber + ' แล้ว ยอดรวม ' + amount;
    const shipping = lang === 'en' ? ' The shop will ask you for the delivery address.' : ' ทางร้านจะขอที่อยู่จัดส่งอีกครั้งนะคะ';
    return delivered(order, title + (order.deliveryMethod === 'shipping' ? shipping : ''), 'order-confirm:');
  }
  const fallback = () => delivered(order, lang === 'en' ? 'The shop will send you the payment details here.' : 'ทางร้านจะแจ้งวิธีชำระเงินให้อีกครั้งนะคะ', 'order-pay-fallback:');
  if (work.payment_fallback_required !== null)
    return work.payment_fallback_required ? fallback() : true;
  const listeners = registeredHooks('confirmed');
  let needsFallback = !listeners.some(([, role]) => role === 'payment');
  for (const [hook, role] of listeners) {
    try {
      await hook(order, { actor });
    }
    catch (error) {
      if (!(role === 'payment' && error instanceof AppError && error.code === 'POLICY_BLOCKED' && error.details?.reason === 'payments_not_configured'))
        throw error;
      needsFallback = true;
    }
  }
  await db.query('UPDATE order_outbox SET payment_fallback_required=$3 WHERE business_id=$1 AND id=$2', [businessId, work.id, needsFallback]);
  return needsFallback ? fallback() : true;
}
export async function orderOutbox(job: JobContext<{
  orderId: string;
}>) {
  if (!job.businessId)
    throw new AppError('VALIDATION_ERROR', 'Order job requires a business');
  const order = await getOrder(job.businessId, job.payload.orderId);
  const { rows } = await db.query<Work>(`SELECT id,kind,state,payment_fallback_required FROM order_outbox WHERE business_id=$1 AND order_id=$2
  AND state='pending' AND kind IN ('confirmation','payment_request','staff_notify')
  ORDER BY CASE kind WHEN 'confirmation' THEN 1 WHEN 'payment_request' THEN 2 ELSE 3 END`, [order.businessId, order.id]);
  const actor = await db.one<OrderActor>(`SELECT actor_kind AS kind,actor_user_id AS "userId" FROM order_events
  WHERE business_id=$1 AND order_id=$2 AND action='order.create' ORDER BY created_at LIMIT 1`, [order.businessId, order.id]);
  for (const row of rows) {
    try {
      const done = await processWork(row, order, actor);
      if (!done)
        return { retryAt: new Date(Date.now() + 1500).toISOString() };
      await db.query("UPDATE order_outbox SET state='done',done_at=now(),last_error=NULL WHERE business_id=$1 AND id=$2", [order.businessId, row.id]);
    }
    catch (error) {
      const code = error instanceof AppError ? error.code : 'INTERNAL';
      const failed = job.attempt >= job.maxAttempts;
      await db.query("UPDATE order_outbox SET attempts=attempts+1,last_error=$3,state=$4 WHERE business_id=$1 AND id=$2", [order.businessId, row.id, code, failed ? 'failed' : 'pending']);
      if (failed)
        await audit({ action: 'orders.outbox.failed', actorUserId: null, businessId: order.businessId, targetType: 'order', targetId: order.id, details: { kind: row.kind, code } });
      throw new AppError('INTERNAL', 'Order outbox step unavailable', { retryable: true });
    }
  }
}

import type { AiTurnTopic } from '@nless/shared/features/ai-agent/types';
import type { MerchantProductEvidence, MerchantReport } from '@nless/shared/features/insights/merchant';
import type { OrderSummary } from '@nless/shared/features/orders/types';
import { AppError, db } from '../../core';
import { listAiTurnTopics } from '../ai-agent/service';
import { listOrdersByCustomer } from '../orders/service';

const MAX_CUSTOMERS = 50;
const MAX_ORDERS_PER_CUSTOMER = 100;
const MAX_TOPICS = 500;
const ORDER_READ_CONCURRENCY = 5;
type Period = Pick<MerchantReport, 'since' | 'until'>;

interface Cohort extends Period {
  chats: { id: string; customerId: string }[];
  handoffs: number;
  pendingSupport: number;
}

async function readCohort(businessId: string, days: number, now: Date): Promise<Cohort> {
  return db.one<Cohort>(`
    WITH bounds AS (
      SELECT $3::timestamptz AS stop,
        ((($3::timestamptz AT TIME ZONE 'Asia/Bangkok')::date - ($2::int - 1))::timestamp
        AT TIME ZONE 'Asia/Bangkok') AS start
    ), chats AS (
      SELECT DISTINCT c.id, c.customer_id, c.status, c.handler
      FROM messages m
      JOIN conversations c ON c.id=m.conversation_id AND c.business_id=m.business_id
      JOIN customers u ON u.id=c.customer_id AND u.business_id=c.business_id
      CROSS JOIN bounds
      WHERE m.business_id=$1 AND m.channel='line' AND c.channel='line'
        AND m.direction='inbound' AND m.author='customer' AND m.origin='live'
        AND u.external_id NOT LIKE 'eval-%' AND u.external_id NOT LIKE 'live-sim:%'
        AND m.created_at >= start AND m.created_at < stop
    ), handoffs AS (
      SELECT c.id,c.status,c.handler,max(a.created_at) AS requested_at
      FROM chats c JOIN audit_events a ON a.business_id=$1 AND a.target_type='conversation'
        AND a.target_id=c.id::text AND a.action='conversation.handoff.requested'
      CROSS JOIN bounds
      WHERE a.created_at >= start AND a.created_at < stop
      GROUP BY c.id,c.status,c.handler
    )
    SELECT to_char(start AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS since,
      to_char(stop AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS until,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'customerId',customer_id)) FROM chats),'[]') AS chats,
      (SELECT count(*)::int FROM handoffs) AS handoffs,
      (SELECT count(*)::int FROM handoffs h WHERE h.status='open' AND h.handler='human'
        AND NOT EXISTS (SELECT 1 FROM messages s WHERE s.business_id=$1 AND s.conversation_id=h.id
          AND s.channel='line' AND s.direction='outbound' AND s.author='staff' AND s.origin='live'
          AND s.delivery_state='sent' AND s.created_at >= h.requested_at AND s.created_at < stop)) AS "pendingSupport"
    FROM bounds`, [businessId, days, now.toISOString()]);
}

function inPeriod(value: string, period: Period): boolean {
  const time = Date.parse(value);
  return time >= Date.parse(period.since) && time < Date.parse(period.until);
}

async function readOrders(businessId: string, cohort: Cohort, customerIds: string[]): Promise<OrderSummary[] | null> {
  if (customerIds.length > MAX_CUSTOMERS) return null;
  const byCustomer = new Map(cohort.chats.map(chat => [chat.id, chat.customerId]));
  const included = new Map<string, OrderSummary>();
  try {
    for (let index = 0; index < customerIds.length; index += ORDER_READ_CONCURRENCY) {
      const batch = customerIds.slice(index, index + ORDER_READ_CONCURRENCY);
      const results = await Promise.all(batch.map(customerId =>
        listOrdersByCustomer(businessId, customerId, { since: cohort.since, limit: MAX_ORDERS_PER_CUSTOMER })));
      for (const [customerIndex, orders] of results.entries()) {
        if (orders.length >= MAX_ORDERS_PER_CUSTOMER) return null;
        for (const order of orders) {
          if (order.businessId === businessId && order.conversationId && byCustomer.get(order.conversationId) === batch[customerIndex]
            && order.status !== 'cancelled' && inPeriod(order.createdAt, cohort)) included.set(order.id, order);
        }
      }
    }
    return [...included.values()];
  } catch (error) {
    if (error instanceof AppError && error.code === 'SERVICE_NOT_READY') return null;
    throw error;
  }
}

async function readTopics(businessId: string, cohort: Cohort): Promise<AiTurnTopic[] | null> {
  const topics = await listAiTurnTopics(businessId, { finishedFrom: cohort.since, finishedTo: cohort.until, limit: MAX_TOPICS });
  if (topics.length >= MAX_TOPICS) return null;
  if (!topics.length) return [];
  const eligibleChats = new Map(cohort.chats.map(chat => [chat.id, chat.customerId]));
  const eligibleTopics = topics.filter(topic => topic.businessId === businessId && eligibleChats.has(topic.conversationId) && eligibleChats.get(topic.conversationId) === topic.customerId);
  const ids = [...new Set(eligibleTopics.map(topic => topic.inboundMessageId))];
  if (!ids.length) return [];
  const { rows } = await db.query<{ id: string; conversation_id: string }>(`
    SELECT id,conversation_id FROM messages WHERE business_id=$1 AND id=ANY($2::uuid[])
      AND channel='line' AND direction='inbound' AND author='customer' AND origin='live'
      AND created_at >= $3 AND created_at < $4`, [businessId, ids, cohort.since, cohort.until]);
  const inbounds = new Map(rows.map(row => [row.id, row.conversation_id]));
  return eligibleTopics.filter(topic => inbounds.get(topic.inboundMessageId) === topic.conversationId
    && inPeriod(topic.finishedAt, cohort));
}

function summarizeProducts(topics: AiTurnTopic[], orders: OrderSummary[]): MerchantProductEvidence[] {
  const orderSkus = new Map<string, Set<string>>();
  for (const order of orders) {
    const conversationId = order.conversationId!;
    const skus = orderSkus.get(conversationId) ?? new Set<string>();
    for (const line of order.lines) skus.add(line.sku.trim().toLowerCase());
    orderSkus.set(conversationId, skus);
  }

  const productChats = new Map<string, { sku: string; name: string; chats: Set<string> }>();
  for (const topic of topics) {
    for (const product of topic.productRefs) {
      const sku = product.sku.trim();
      const key = sku.toLowerCase();
      if (!key) continue;
      const existing = productChats.get(key);
      if (existing) {
        existing.chats.add(topic.conversationId);
        existing.name = product.name.trim() || existing.name;
      } else productChats.set(key, { sku, name: product.name.trim() || sku, chats: new Set([topic.conversationId]) });
    }
  }
  return [...productChats.entries()].map(([key, product]) => ({
    sku: product.sku,
    name: product.name,
    conversations: product.chats.size,
    withoutOrder: [...product.chats].filter(chat => !orderSkus.get(chat)?.has(key)).length,
  })).sort((a, b) => b.withoutOrder - a.withoutOrder || b.conversations - a.conversations || a.sku.localeCompare(b.sku)).slice(0, 10);
}

export async function merchantReport(businessId: string, days: 7 | 30, now = new Date()): Promise<MerchantReport> {
  const cohort = await readCohort(businessId, days, now);
  const customerIds = [...new Set(cohort.chats.map(chat => chat.customerId))];
  const orders = await readOrders(businessId, cohort, customerIds);
  const topics = orders && customerIds.length ? await readTopics(businessId, cohort) : [];
  return {
    since: cohort.since, until: cohort.until, conversations: cohort.chats.length, customers: customerIds.length,
    orders: orders?.length ?? null, handoffs: cohort.handoffs, pendingSupport: cohort.pendingSupport,
    products: orders && topics ? summarizeProducts(topics, orders) : null,
  };
}

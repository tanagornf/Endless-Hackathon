import type { DailyAnalytics, DashboardData, RangeInfo, ReplyTiming } from '@nless/shared/features/analytics/types';
import { db } from '../../core';

export interface OverviewFacts {
  active: number;
  customers: number;
  new_customers: number;
  messages: DashboardData['messages'];
  now_counts: DashboardData['now'];
  daily: DailyAnalytics[];
  hourly: DashboardData['hourly'];
  auto_resolved: number;
  handed_off: number;
  staff_touched: number;
  first_response: { ai: ReplyTiming; staff: ReplyTiming; all: ReplyTiming; unanswered: number };
  cost_calls: number;
  cost_known: number | null;
  cost_unknown: number;
}

export function readOverview(businessId: string, range: RangeInfo): Promise<OverviewFacts> {
  return db.one<OverviewFacts>(`
    WITH eligible AS (
      SELECT c.id,c.customer_id,c.status,c.handler,c.assignee_user_id,u.first_seen_at
      FROM conversations c JOIN customers u ON u.business_id=c.business_id AND u.id=c.customer_id
      WHERE c.business_id=$1 AND c.channel='line' AND u.channel='line'
        AND u.external_id NOT LIKE 'eval-%' AND u.external_id NOT LIKE 'live-sim:%'
    ), messages_in_window AS (
      SELECT m.conversation_id,m.direction,m.author,m.created_at
      FROM messages m JOIN eligible e ON e.id=m.conversation_id
      WHERE m.business_id=$1 AND m.channel='line' AND m.origin='live'
        AND m.created_at >= $2 AND m.created_at < $3
        AND ((m.direction='inbound' AND m.author='customer') OR (m.direction='outbound' AND m.author IN ('ai','staff')))
    ), active AS (
      SELECT m.conversation_id,e.customer_id,min(m.created_at) AS first_in
      FROM messages_in_window m JOIN eligible e ON e.id=m.conversation_id
      WHERE m.direction='inbound' GROUP BY m.conversation_id,e.customer_id
    ), reply_flags AS (
      SELECT conversation_id,bool_or(author='ai') AS ai,bool_or(author='staff') AS staff
      FROM messages_in_window WHERE direction='outbound' GROUP BY conversation_id
    ), handoff AS (
      SELECT DISTINCT a.conversation_id FROM audit_events event
      JOIN active a ON a.conversation_id::text=event.target_id
      WHERE event.business_id=$1 AND event.target_type='conversation' AND event.created_at >= $2 AND event.created_at < $3
        AND (event.action='conversation.handoff.requested' OR
          (event.action='conversation.assign' AND event.details->>'handler'='human'))
    ), impact AS (
      SELECT a.conversation_id, a.first_in, coalesce(r.staff,false) AS staff, h.conversation_id IS NOT NULL AS handed_off,
        coalesce(r.ai,false) AND NOT coalesce(r.staff,false) AND h.conversation_id IS NULL AS auto_resolved
      FROM active a LEFT JOIN reply_flags r USING(conversation_id) LEFT JOIN handoff h USING(conversation_id)
    ), first_response AS (
      SELECT turn.author,extract(epoch FROM turn.created_at-a.first_in) AS seconds
      FROM active a CROSS JOIN LATERAL (
        SELECT m.author,m.created_at FROM messages m
        WHERE m.business_id=$1 AND m.conversation_id=a.conversation_id AND m.channel='line' AND m.origin='live'
          AND m.direction='outbound' AND m.author IN ('ai','staff')
          AND m.created_at > a.first_in AND m.created_at <= a.first_in+interval '24 hours'
        ORDER BY m.created_at,m.seq LIMIT 1
      ) turn
    ), daily_counts AS (
      SELECT (created_at AT TIME ZONE $4)::date::text AS date,
        count(DISTINCT conversation_id) FILTER (WHERE direction='inbound')::int AS conversations,
        count(*) FILTER (WHERE author='customer')::int AS "customerMessages",
        count(*) FILTER (WHERE author='ai')::int AS "aiReplies",
        count(*) FILTER (WHERE author='staff')::int AS "staffMessages"
      FROM messages_in_window GROUP BY 1
    ), hourly_counts AS (
      SELECT extract(hour FROM created_at AT TIME ZONE $4)::int AS hour,count(*)::int AS "customerMessages"
      FROM messages_in_window WHERE direction='inbound' GROUP BY 1
    ), cost AS (
      SELECT count(*)::int AS calls, sum(u.cost_usd_micros)::float8 AS known,
        count(*) FILTER (WHERE u.cost_usd_micros IS NULL)::int AS unknown
      FROM model_usage u JOIN impact i ON i.conversation_id=u.conversation_id
      WHERE u.business_id=$1 AND u.mode='openai' AND u.created_at >= $2 AND u.created_at < $3 AND i.auto_resolved
    )
    SELECT (SELECT count(*)::int FROM active) AS active,
      (SELECT count(DISTINCT customer_id)::int FROM active) AS customers,
      (SELECT count(*)::int FROM customers WHERE business_id=$1 AND channel='line' AND first_seen_at >= $2 AND first_seen_at < $3
        AND external_id NOT LIKE 'eval-%' AND external_id NOT LIKE 'live-sim:%') AS new_customers,
      (SELECT jsonb_build_object('customer',count(*) FILTER(WHERE author='customer'),'ai',count(*) FILTER(WHERE author='ai'),
        'staff',count(*) FILTER(WHERE author='staff')) FROM messages_in_window) AS messages,
      (SELECT jsonb_build_object('openConversations',count(*) FILTER (WHERE status='open'),
        'waitingForStaff',count(*) FILTER (WHERE status='open' AND handler='human' AND assignee_user_id IS NULL)) FROM eligible) AS now_counts,
      coalesce((SELECT jsonb_agg(d ORDER BY date) FROM daily_counts d),'[]') AS daily,
      coalesce((SELECT jsonb_agg(h ORDER BY hour) FROM hourly_counts h),'[]') AS hourly,
      (SELECT count(*)::int FROM impact WHERE auto_resolved) AS auto_resolved,
      (SELECT count(*)::int FROM impact WHERE handed_off) AS handed_off,
      (SELECT count(*)::int FROM impact WHERE staff) AS staff_touched,
      (SELECT jsonb_build_object(
        'ai',jsonb_build_object('n',count(*) FILTER(WHERE author='ai'),'medianSeconds',percentile_cont(.5) WITHIN GROUP(ORDER BY seconds) FILTER(WHERE author='ai')),
        'staff',jsonb_build_object('n',count(*) FILTER(WHERE author='staff'),'medianSeconds',percentile_cont(.5) WITHIN GROUP(ORDER BY seconds) FILTER(WHERE author='staff')),
        'all',jsonb_build_object('n',count(*),'medianSeconds',percentile_cont(.5) WITHIN GROUP(ORDER BY seconds)),
        'unanswered',(SELECT count(*) FROM active)-count(*)) FROM first_response) AS first_response,
      cost.calls AS cost_calls,cost.known AS cost_known,cost.unknown AS cost_unknown
    FROM cost`, [businessId, range.fromUtc, range.toUtc, range.timezone]);
}

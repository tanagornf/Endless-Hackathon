import { db, log } from '../../core';
import type { LineConnectionView } from '@nless/shared/features/line/types';
import { notify } from '../notifications/service';
import { lineRequest } from './lineApi';
import { z } from 'zod';

const quotaSchema = z.object({ type: z.string(), value: z.number().optional() });
const usageSchema = z.object({ totalUsage: z.number() });

export async function getLineQuota(token: string): Promise<LineConnectionView['push']['lineQuota']> {
  const [quota, consumption] = await Promise.all([
    lineRequest('/v2/bot/message/quota', { token }),
    lineRequest('/v2/bot/message/quota/consumption', { token }),
  ]);
  if (quota?.status !== 200 || consumption?.status !== 200) return null;
  const limit = quotaSchema.safeParse(quota.body);
  const used = usageSchema.safeParse(consumption.body);
  if (!limit.success || !used.success) return null;
  return { type: limit.data.type, value: limit.data.value ?? null, used: used.data.totalUsage };
}

export async function getPushUsage(businessId: string): Promise<LineConnectionView['push']> {
  const result = await db.one<{ month: string; calls: number; messages: number; alerted: Date | null }>(
    "SELECT d.month::text AS month, COALESCE(p.push_calls, 0) AS calls, COALESCE(p.push_messages, 0) AS messages, p.quota_alerted_at AS alerted FROM (SELECT date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')::date AS month) d LEFT JOIN line_push_usage p ON p.month = d.month AND p.business_id = $1",
    [businessId],
  );
  return { month: result.month, calls: result.calls, messages: result.messages, quotaAlertedAt: result.alerted?.toISOString() ?? null, lineQuota: null };
}

export async function notifyQuota(businessId: string) {
  const claimed = await db.maybeOne<{ day: string }>(
    "INSERT INTO line_push_usage (business_id, month, quota_alerted_at) VALUES ($1, date_trunc('month', now() AT TIME ZONE 'Asia/Bangkok')::date, now()) ON CONFLICT (business_id, month) DO UPDATE SET quota_alerted_at = now() WHERE line_push_usage.quota_alerted_at IS NULL OR (line_push_usage.quota_alerted_at AT TIME ZONE 'Asia/Bangkok')::date < (now() AT TIME ZONE 'Asia/Bangkok')::date RETURNING (quota_alerted_at AT TIME ZONE 'Asia/Bangkok')::date::text AS day",
    [businessId],
  );
  if (!claimed) return;
  await notify({
    businessId, to: { role: 'owners' }, type: 'system',
    title: 'ถึงขีดจำกัดการส่งข้อความ LINE แล้ว / LINE push limit reached',
    body: 'ส่งข้อความแบบ Push ไม่ได้จนกว่า LINE จะรีเซ็ตจำนวนข้อความ / Push messages are unavailable until LINE resets its allowance.',
    link: '/channels', dedupKey: 'line-quota:' + businessId + ':' + claimed.day,
  }).catch(() => log.warn({ businessId }, 'Could not notify owners of LINE push limit'));
}

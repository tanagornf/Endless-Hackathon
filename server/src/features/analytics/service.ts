import { z } from 'zod';
import type { AnalyticsSettings, DashboardData, SellerImpact } from '@nless/shared/features/analytics/types';
import { AppError, auditInTransaction, db } from '../../core';
import { readOverview } from './kpi';
import { eachDate, resolveRange, type RangeQuery } from './range';

export const updateSettingsBody = z.object({
  expectedVersion: z.number().int().positive(),
  minutesPerConversation: z.number().int().min(1).max(60),
}).strict();
const settingsColumns = 'business_id AS "businessId",minutes_per_conversation AS "minutesPerConversation",version';

export async function getSettings(businessId: string): Promise<AnalyticsSettings> {
  return await db.maybeOne<AnalyticsSettings>('SELECT ' + settingsColumns + ' FROM analytics_settings WHERE business_id=$1', [businessId])
    ?? { businessId, minutesPerConversation: 3, version: 1 };
}

export function updateSettings(businessId: string, actorUserId: string, input: z.infer<typeof updateSettingsBody>): Promise<AnalyticsSettings> {
  return db.tx(async tx => {
    await tx.query('INSERT INTO analytics_settings (business_id) VALUES ($1) ON CONFLICT DO NOTHING', [businessId]);
    const updated = await tx.maybeOne<AnalyticsSettings>(`
      UPDATE analytics_settings SET minutes_per_conversation=$2,version=version+1,updated_by=$3,updated_at=now()
      WHERE business_id=$1 AND version=$4 RETURNING ${settingsColumns}`,
      [businessId, input.minutesPerConversation, actorUserId, input.expectedVersion]);
    if (!updated) throw new AppError('VERSION_CONFLICT', 'Shop estimate settings changed');
    await auditInTransaction(tx, [{ businessId, actorUserId, action: 'analytics.settings.update', targetType: 'analytics_settings',
      targetId: businessId, details: { minutesPerConversation: updated.minutesPerConversation, version: updated.version } }]);
    return updated;
  });
}

const percent = (count: number, active: number) => active ? count * 100 / active : null;
const unavailable = { available: false, reason: 'not_built' } as const;

export async function getDashboard(businessId: string, timezone: string, query: RangeQuery): Promise<DashboardData> {
  const range = await resolveRange(timezone, query);
  const [facts, settings] = await Promise.all([readOverview(businessId, range), getSettings(businessId)]);
  const computedAt = new Date().toISOString();
  const days = new Map(facts.daily.map(row => [row.date, row]));
  const hours = new Map(facts.hourly.map(row => [row.hour, row]));
  const impact: SellerImpact = {
    range, computedAt, activeConversations: facts.active,
    autoResolved: { count: facts.auto_resolved, pct: percent(facts.auto_resolved, facts.active) },
    handoff: { count: facts.handed_off, ratePct: percent(facts.handed_off, facts.active) },
    firstResponse: facts.first_response, staffTouched: facts.staff_touched,
    orders: unavailable, followUps: unavailable,
    aiCost: {
      basis: facts.cost_calls ? 'openai' : 'none', calls: facts.cost_calls, knownUsdMicros: facts.cost_known,
      unknownRows: facts.cost_unknown, isEstimate: true,
      perAutoResolvedUsdMicros: facts.cost_known !== null && facts.cost_unknown === 0 && facts.auto_resolved > 0
        ? facts.cost_known / facts.auto_resolved : null,
    },
    staffMinutesSaved: {
      minutes: facts.auto_resolved ? facts.auto_resolved * settings.minutesPerConversation : null,
      minutesPerConversation: settings.minutesPerConversation, isEstimate: true,
    },
  };
  return {
    range, computedAt, impact, messages: facts.messages, now: facts.now_counts,
    conversations: { active: facts.active, customersActive: facts.customers, newCustomers: facts.new_customers },
    daily: eachDate(range).map(date => days.get(date) ?? { date, conversations: 0, customerMessages: 0, aiReplies: 0, staffMessages: 0 }),
    hourly: Array.from({ length: 24 }, (_, hour) => hours.get(hour) ?? { hour, customerMessages: 0 }),
    channels: facts.active ? [{ channel: 'line', conversations: facts.active }] : [],
  };
}

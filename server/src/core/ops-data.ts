import { FEATURES } from '@nless/shared/core/features';
import type { AuditQuery, BulkFlagsBody, DeliveriesQuery, OpsAuditRow, OpsDeliveryRow, OpsFeatureRow, ResolveDeliveryBody } from '@nless/shared/core/ops';
import type { DeliveryMode, FeatureFlagView, Page } from '@nless/shared/core/types';
import type { z } from 'zod';
import { config } from './config';
import { db } from './db';
import { AppError } from './errors';
import { featureFlags } from './features';
import { publishJob } from './jobs';
import { opsAudit, opsPolicy, safeOpsText } from './ops-audit';
import { createdAtForCursor, cursorPage, readOpsCursor } from './ops-page';
import { publish } from './realtime';
import { redactObject } from './redact';

type DeliveryRecord = Omit<OpsDeliveryRow, 'messageId'> & { id: string };
const deliveryColumns = `m.id,m.conversation_id AS "conversationId",m.business_id AS "businessId",
  m.channel,m.delivery_state AS "deliveryState",m.delivery_error AS "deliveryError",
  ${createdAtForCursor('m.created_at')}`;

function deliveryView({ id, deliveryError, ...row }: DeliveryRecord): OpsDeliveryRow {
  return { ...row, messageId: id, deliveryError: safeOpsText(deliveryError) };
}

export async function listOpsDeliveries(query: z.output<typeof DeliveriesQuery>): Promise<Page<OpsDeliveryRow>> {
  const cursor = query.cursor === undefined ? null : readOpsCursor(query.cursor);
  const { rows } = await db.query<DeliveryRecord>(`SELECT ${deliveryColumns} FROM messages m
    WHERE m.direction='outbound' AND m.delivery_state=$1
      AND ($2::timestamptz IS NULL OR (m.created_at,m.id)<($2::timestamptz,$3::uuid))
    ORDER BY m.created_at DESC,m.id DESC LIMIT $4`,
    [query.state, cursor?.createdAt ?? null, cursor?.id ?? null, query.limit + 1]);
  return cursorPage(rows, query.limit, deliveryView);
}

export async function resolveOpsDelivery(id: string, body: z.output<typeof ResolveDeliveryBody>, actorUserId: string) {
  const resolved = await db.tx(async (tx) => {
    const current = await tx.maybeOne<DeliveryRecord & { mode: DeliveryMode | null }>(`
      SELECT ${deliveryColumns},m.delivery_mode AS mode FROM messages m WHERE m.id=$1 AND m.direction='outbound' FOR UPDATE`, [id]);
    if (!current) throw new AppError('NOT_FOUND', 'Outbound message not found');
    if (current.deliveryState !== 'unknown') throw opsPolicy('not_unknown');
    const { businessId, conversationId } = current;
    let queued: { id: string; type: string; business_id: string } | null = null;
    if (body.resolution === 'resend') {
      const { count } = await tx.one<{ count: number }>(`SELECT count(*)::int AS count FROM audit_events
        WHERE action='core.delivery.resolve' AND target_type='message' AND target_id=$1 AND business_id=$2`, [id, businessId]);
      // The message row is locked until the state, job and audit commit together.
      queued = await tx.one(`INSERT INTO jobs (type,payload,business_id,dedup_key,lock_key,max_attempts)
        VALUES ('core.deliver',jsonb_build_object('messageId',$1::text),$2,$3,$4,$5)
        RETURNING id,type,business_id`, [id, businessId, 'deliver:' + id + ':resend-' + (count + 1),
        'conversation:' + conversationId, config.JOBS_MAX_ATTEMPTS]);
    }
    const state = body.resolution === 'resend' ? 'pending' : body.resolution;
    const row = await tx.one<DeliveryRecord>(`UPDATE messages m SET delivery_state=$2,
      delivery_error=CASE WHEN $2='failed' THEN m.delivery_error ELSE NULL END
      WHERE m.id=$1 AND m.business_id=$3 RETURNING ${deliveryColumns}`, [id, state, businessId]);
    await opsAudit(tx, {
      action: 'core.delivery.resolve', actorUserId, businessId, targetType: 'message', targetId: id,
      details: { resolution: body.resolution, note: safeOpsText(body.note ?? null, 200) },
    });
    return { row, queued, mode: current.mode };
  });
  if (resolved.queued) publishJob(resolved.queued, 'queued');
  const view = deliveryView(resolved.row);
  publish(view.businessId, {
    type: 'message.updated', conversationId: view.conversationId, messageId: view.messageId,
    delivery: { state: view.deliveryState, mode: resolved.mode },
  });
  return view;
}

type Registry = Parameters<typeof featureFlags>[0];

function featureFlagView(row: FeatureFlagView): FeatureFlagView {
  return { ...row, reason: safeOpsText(row.reason, 200) };
}

export async function listOpsFeatures(routes: Registry, tierOpen: (tier: FeatureFlagView['tier']) => boolean) {
  const flags = await featureFlags(routes);
  const byId = new Map(flags.map((row) => [row.featureId, row]));
  const items = FEATURES.map((feature): OpsFeatureRow => {
    const flag = byId.get(feature.id) ?? {
      featureId: feature.id, slug: feature.slug, lane: feature.lane, tier: feature.tier,
      hidden: false, visible: true, reason: null, placeholder: false,
    };
    return {
      ...featureFlagView(flag), tierOpen: tierOpen(flag.tier),
      routeCount: routes.filter((route) => route.featureId === feature.id).length,
    };
  });
  return { production: config.NODE_ENV === 'production', items };
}

export async function setOpsFeatures(routes: Registry, body: z.output<typeof BulkFlagsBody>, actorUserId: string) {
  const changes = new Map<string, boolean>();
  for (const id of body.hide) changes.set(id, true);
  for (const id of body.show) changes.set(id, false);
  for (const id of changes.keys()) {
    if (!FEATURES.some((feature) => feature.id === id && feature.folder)) {
      throw new AppError('VALIDATION_ERROR', 'Unknown or non-selectable feature', { details: { featureId: id } });
    }
  }
  const views = (await featureFlags(routes)).filter((row) => changes.has(row.featureId));
  const reason = safeOpsText(body.reason ?? null, 200);
  await db.tx(async (tx) => {
    // Consistent lock order for concurrent batches with intersecting features.
    for (const [featureId, hidden] of [...changes].sort(([a], [b]) => a.localeCompare(b))) {
      await tx.query(`INSERT INTO feature_flags (feature_id,hidden,reason,updated_by) VALUES ($1,$2,$3,$4)
        ON CONFLICT (feature_id) DO UPDATE SET hidden=excluded.hidden,reason=excluded.reason,
          updated_by=excluded.updated_by,updated_at=now()`, [featureId, hidden, reason, actorUserId]);
      await opsAudit(tx, {
        action: 'core.feature.toggle', actorUserId, targetType: 'feature', targetId: featureId,
        details: { featureId, hidden, reason },
      });
    }
    await opsAudit(tx, {
      action: 'ops.features.bulk', actorUserId,
      details: { hide: [...new Set(body.hide)], show: [...new Set(body.show)], reason },
    });
  });
  return { items: views.map((view) => {
    const hidden = changes.get(view.featureId)!;
    return { ...view, hidden, reason, visible: !hidden && !(view.placeholder && config.NODE_ENV === 'production') };
  }) };
}

export async function listOpsAudit(query: z.output<typeof AuditQuery>): Promise<Page<OpsAuditRow>> {
  const cursor = query.cursor === undefined ? null : readOpsCursor(query.cursor);
  const { rows } = await db.query<OpsAuditRow>(`SELECT a.id,a.action,a.actor_user_id AS "actorUserId",
    a.business_id AS "businessId",a.target_type AS "targetType",a.target_id AS "targetId",a.details,
    ${createdAtForCursor('a.created_at')} FROM audit_events a
    WHERE ($1::text IS NULL OR a.action=$1) AND ($2::uuid IS NULL OR a.business_id=$2)
      AND ($3::timestamptz IS NULL OR (a.created_at,a.id)<($3::timestamptz,$4::uuid))
    ORDER BY a.created_at DESC,a.id DESC LIMIT $5`,
    [query.action ?? null, query.businessId ?? null, cursor?.createdAt ?? null, cursor?.id ?? null, query.limit + 1]);
  return cursorPage(rows, query.limit, (row) => ({
    ...row, targetId: safeOpsText(row.targetId, 200), details: redactObject(row.details),
  }));
}

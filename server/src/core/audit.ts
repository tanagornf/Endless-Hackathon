import { db } from './db';
import { requestContext } from './log';
import type { DbExecutor } from './types';

export interface AuditInput {
  action: string;
  actorUserId: string | null;
  businessId?: string | null;
  accountId?: string | null;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

export async function auditInTransaction(tx: DbExecutor, events: readonly AuditInput[]): Promise<void> {
  if (!events.length) return;
  const requestId = requestContext.getStore()?.requestId ?? null;
  const rows = events.map((event) => ({
    action: event.action,
    actor_user_id: event.actorUserId,
    business_id: event.businessId ?? null,
    account_id: event.accountId ?? null,
    target_type: event.targetType ?? null,
    target_id: event.targetId ?? null,
    details: JSON.stringify(event.details ?? {}),
    request_id: event.requestId ?? requestId,
  }));
  await tx.query(`
    INSERT INTO audit_events (action,actor_user_id,business_id,account_id,target_type,target_id,details,request_id)
    SELECT action,actor_user_id,business_id,account_id,target_type,target_id,details::jsonb,request_id
    FROM jsonb_to_recordset($1::jsonb) AS event(
      action text, actor_user_id uuid, business_id uuid, account_id uuid,
      target_type text, target_id text, details text, request_id text
    )`, [JSON.stringify(rows)]);
}

export function audit(input: AuditInput): Promise<void> {
  return auditInTransaction(db, [input]);
}

import { db } from './db';
import { requestContext } from './log';

export async function audit(input: {
  action: string;
  actorUserId: string | null;
  businessId?: string | null;
  accountId?: string | null;
  targetType?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  requestId?: string;
}): Promise<void> {
  await db.query(`INSERT INTO audit_events (action,actor_user_id,business_id,account_id,target_type,target_id,details,request_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`, [
    input.action, input.actorUserId, input.businessId ?? null, input.accountId ?? null,
    input.targetType ?? null, input.targetId ?? null, JSON.stringify(input.details ?? {}),
    input.requestId ?? requestContext.getStore()?.requestId ?? null,
  ]);
}

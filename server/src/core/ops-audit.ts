import { AppError } from './errors';
import { requestContext } from './log';
import { redactText } from './redact';
import type { DbExecutor } from './types';

export function safeOpsText(value: string | null, maxLength?: number): string | null {
  return value === null ? null : redactText(value, maxLength);
}

export function opsPolicy(reason: string): AppError {
  return new AppError('POLICY_BLOCKED', reason, { details: { reason } });
}

// Keep the audit event in the same transaction as the operational write.
export async function opsAudit(tx: DbExecutor, input: {
  action: string; actorUserId: string; businessId?: string | null; targetType?: string;
  targetId?: string; details?: Record<string, unknown>;
}): Promise<void> {
  await tx.query(`INSERT INTO audit_events
    (action, actor_user_id, business_id, target_type, target_id, details, request_id)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`, [
    input.action, input.actorUserId, input.businessId ?? null, input.targetType ?? null,
    input.targetId ?? null, JSON.stringify(input.details ?? {}), requestContext.getStore()?.requestId ?? null,
  ]);
}

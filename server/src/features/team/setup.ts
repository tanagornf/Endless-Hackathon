import type { AssignmentResult } from '@nless/shared/features/team/types';
import { AppError, audit, db, publish } from '../../core';

export async function changeAssignee(conversationId: string, handler: 'ai' | 'human', assigneeUserId: string | null,
  opts?: { businessId?: string; expectedVersion?: number; actorUserId?: string }): Promise<AssignmentResult> {
  const row = await db.tx(async (tx) => {
    const current = await tx.maybeOne<{ business_id: string; version: number; status: 'open' | 'closed' }>(
      'SELECT business_id,version,status FROM conversations WHERE id=$1 AND ($2::uuid IS NULL OR business_id=$2) FOR UPDATE',
      [conversationId, opts?.businessId ?? null],
    );
    if (!current) throw new AppError('NOT_FOUND', 'Conversation not found');
    if (opts?.expectedVersion !== undefined && current.version !== opts.expectedVersion) throw new AppError('VERSION_CONFLICT', 'Conversation changed');
    if (assigneeUserId) {
      const member = await tx.maybeOne("SELECT 1 FROM memberships WHERE business_id=$1 AND user_id=$2 AND status='active'", [current.business_id, assigneeUserId]);
      if (!member) throw new AppError('VALIDATION_ERROR', 'Assignee is not an active member');
    }
    const updated = await tx.one<{ version: number }>(
      'UPDATE conversations SET handler=$2,assignee_user_id=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING version',
      [conversationId, handler, assigneeUserId],
    );
    return { ...current, version: updated.version };
  });
  const result = { conversationId, handler, assigneeUserId, version: row.version };
  await audit({ action: 'conversation.assign', actorUserId: opts?.actorUserId ?? null, businessId: row.business_id, targetType: 'conversation', targetId: conversationId, details: { handler, assigneeUserId } });
  publish(row.business_id, { type: 'conversation.updated', ...result, status: row.status });
  return result;
}

import type { AiHandoffIntent, AiHandoffReceipt } from '@nless/shared/features/team/types';
import { z } from 'zod';
import { auditInTransaction, db, log, publish } from '../../core';
import type { DbExecutor } from '../../core';
import { notifyHandoff } from './handoffNotification';
import { uuid } from './validation';

const intentSchema = z.object({
  businessId: uuid, conversationId: uuid, turnId: uuid,
  reason: z.string().min(1), expectedVersion: z.number().int().min(1).max(2147483646),
});

type ReceiptKey = Pick<AiHandoffIntent, 'businessId' | 'conversationId' | 'turnId'>;

function keyParams(key: ReceiptKey) {
  return [key.businessId, key.conversationId, key.turnId];
}

function intentParams(intent: AiHandoffIntent) {
  return [...keyParams(intent), intent.reason, intent.expectedVersion];
}

const receiptColumns = `r.business_id AS "businessId", r.conversation_id AS "conversationId",
  r.turn_id AS "turnId", r.reason, r.expected_version AS "expectedVersion", r.committed_version AS "committedVersion"`;
const receiptKey = 'r.business_id = $1 AND r.conversation_id = $2 AND r.turn_id = $3';
const joinConversation = 'c.id = r.conversation_id AND c.business_id = r.business_id';
const stillQueued = `c.status = 'open' AND c.handler = 'human' AND c.assignee_user_id IS NULL
  AND c.version = r.committed_version`;

function activeReceipt(tx: DbExecutor, intent: AiHandoffIntent) {
  return tx.maybeOne<AiHandoffReceipt>(`SELECT ${receiptColumns}
    FROM team_ai_handoff_receipts r JOIN conversations c ON ${joinConversation}
    WHERE ${receiptKey} AND r.reason = $4 AND r.expected_version = $5 AND ${stillQueued}`, intentParams(intent));
}

export async function getAiHandoffReceipt(intent: AiHandoffIntent): Promise<AiHandoffReceipt | null> {
  return intentSchema.safeParse(intent).success ? activeReceipt(db, intent) : null;
}

export async function applyAiHandoff(intent: AiHandoffIntent): Promise<AiHandoffReceipt | null> {
  if (!intentSchema.safeParse(intent).success) return null;
  const outcome = await db.tx(async (tx) => {
    const row = await tx.maybeOne<{
      customerId: string; status: string; handler: string; assigneeUserId: string | null; version: number;
    }>(`SELECT customer_id AS "customerId", status, handler, assignee_user_id AS "assigneeUserId", version
      FROM conversations WHERE business_id = $1 AND id = $2 FOR UPDATE`, [intent.businessId, intent.conversationId]);
    if (!row || row.status !== 'open' || row.assigneeUserId !== null) return null;
    if (row.handler === 'human') {
      const receipt = await activeReceipt(tx, intent);
      return receipt && { receipt, applied: false };
    }
    if (row.handler !== 'ai' || row.version !== intent.expectedVersion) return null;

    // A turn can never acquire fresh proof after handback, even at a new expected version.
    const receipt = await tx.maybeOne<AiHandoffReceipt>(`INSERT INTO team_ai_handoff_receipts AS r
      (business_id, conversation_id, turn_id, reason, expected_version, committed_version)
      VALUES ($1, $2, $3, $4, $5, $5::integer + 1)
      ON CONFLICT (business_id, conversation_id, turn_id) DO NOTHING RETURNING ${receiptColumns}`, intentParams(intent));
    if (!receipt) return null;
    await tx.query(`UPDATE conversations SET handler = 'human', assignee_user_id = NULL, version = $3, updated_at = now()
      WHERE business_id = $1 AND id = $2`, [receipt.businessId, receipt.conversationId, receipt.committedVersion]);
    await tx.query(`INSERT INTO conversation_notes (business_id, customer_id, conversation_id, kind, body)
      VALUES ($1, $2, $3, 'handover', $4)`, [receipt.businessId, row.customerId, receipt.conversationId,
      'AI ขอให้พนักงานดูแล (เหตุผล: ' + receipt.reason.slice(0, 80) + ')']);
    await auditInTransaction(tx, [{
      action: 'conversation.handoff.requested', actorUserId: null, businessId: receipt.businessId,
      targetType: 'conversation', targetId: receipt.conversationId, requestId: receipt.turnId,
      details: { actor: 'ai', reason: receipt.reason, turnId: receipt.turnId, version: receipt.committedVersion },
    }]);
    return { receipt, applied: true };
  });
  if (!outcome) return null;
  const { receipt } = outcome;
  if (outcome.applied) {
    publish(receipt.businessId, { type: 'conversation.updated', conversationId: receipt.conversationId,
      handler: 'human', assigneeUserId: null, status: 'open', version: receipt.committedVersion });
    await dispatchHandoffNotification(receipt);
  }
  return receipt;
}

async function dispatchHandoffNotification(key: ReceiptKey): Promise<void> {
  try {
    // The lease survives worker death. F31's version key handles a crash after delivery but before completion.
    const target = await db.maybeOne<ReceiptKey & {
      customerId: string; version: number; reason: string; active: boolean;
    }>(`UPDATE team_ai_handoff_receipts r SET notification_due_at = now() + interval '2 minutes'
      FROM conversations c WHERE ${joinConversation} AND ${receiptKey}
      AND r.notification_result IS NULL AND r.notification_due_at <= now()
      RETURNING ${receiptColumns}, c.customer_id AS "customerId", r.committed_version AS version,
        (${stillQueued}) AS active`, keyParams(key));
    if (!target) return;
    const mode = target.active ? (await notifyHandoff(target, target.reason)).mode : 'obsolete';
    await db.query(`UPDATE team_ai_handoff_receipts r SET notification_result = $4
      WHERE ${receiptKey} AND r.notification_result IS NULL`, [...keyParams(key), mode]);
  } catch {
    log.warn({ businessId: key.businessId, turnId: key.turnId }, 'Handoff notification pending retry');
  }
}

export async function retryDueAiHandoffNotifications(): Promise<void> {
  const { rows } = await db.query<ReceiptKey>(`SELECT business_id AS "businessId",
    conversation_id AS "conversationId", turn_id AS "turnId" FROM team_ai_handoff_receipts
    WHERE notification_result IS NULL AND notification_due_at <= now() ORDER BY notification_due_at LIMIT 25`);
  for (const key of rows) await dispatchHandoffNotification(key);
}

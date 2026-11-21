import type {
  AiHandoffIntent, AiHandoffReceipt, ExplicitStaffRequestEvidence, ExplicitStaffRequestNotification,
} from '@nless/shared/features/team/types';
import { z } from 'zod';
import { auditInTransaction, db, log, publish } from '../../core';
import type { DbExecutor } from '../../core';
import { notify } from '../notifications/service';
import { prepareHandoffNotification } from './handoffNotification';
import { uuid } from './validation';

const intentSchema = z.object({
  businessId: uuid, conversationId: uuid, turnId: uuid,
  reason: z.string().min(1), expectedVersion: z.number().int().min(1).max(2147483646),
  explicitRequestEvidence: z.enum(['customer_asked', 'accepted_staff_offer']).optional(),
}).refine((intent) => intent.explicitRequestEvidence === undefined || intent.reason === 'customer_request');

type StoredReceipt = Omit<AiHandoffReceipt, 'explicitRequestEvidence'> & {
  explicitRequestEvidence: ExplicitStaffRequestEvidence | null;
};

function receiptValue(row: StoredReceipt | null): AiHandoffReceipt | null {
  if (!row) return null;
  const { explicitRequestEvidence, ...receipt } = row;
  return explicitRequestEvidence ? { ...receipt, explicitRequestEvidence } : receipt;
}

type ReceiptKey = Pick<AiHandoffIntent, 'businessId' | 'conversationId' | 'turnId'>;

function keyParams(key: ReceiptKey) {
  return [key.businessId, key.conversationId, key.turnId];
}

function intentParams(intent: AiHandoffIntent) {
  return [...keyParams(intent), intent.reason, intent.expectedVersion, intent.explicitRequestEvidence ?? null];
}

const receiptColumns = `r.business_id AS "businessId", r.conversation_id AS "conversationId",
  r.turn_id AS "turnId", r.reason, r.expected_version AS "expectedVersion", r.committed_version AS "committedVersion",
  r.explicit_request_evidence AS "explicitRequestEvidence"`;
const receiptKey = 'r.business_id = $1 AND r.conversation_id = $2 AND r.turn_id = $3';
const joinConversation = 'c.id = r.conversation_id AND c.business_id = r.business_id';
const stillQueued = `c.status = 'open' AND c.handler = 'human' AND c.assignee_user_id IS NULL
  AND c.version = r.committed_version`;

async function activeReceipt(tx: DbExecutor, intent: AiHandoffIntent) {
  return receiptValue(await tx.maybeOne<StoredReceipt>(`SELECT ${receiptColumns}
    FROM team_ai_handoff_receipts r JOIN conversations c ON ${joinConversation}
    WHERE ${receiptKey} AND r.reason = $4 AND r.expected_version = $5
      AND r.explicit_request_evidence IS NOT DISTINCT FROM $6 AND ${stillQueued}`, intentParams(intent)));
}

/** Reloads committed staff-request proof for F31 dispatch and authenticated notification taps. */
export async function getExplicitStaffRequestForNotification(
  businessId: string, dedupKey: string,
): Promise<ExplicitStaffRequestNotification | null> {
  const match = /^handoff:([a-f0-9-]{36}):v([1-9][0-9]{0,9})$/u.exec(dedupKey);
  if (!match || match[0] !== dedupKey || !uuid.safeParse(businessId).success || !uuid.safeParse(match[1]).success) return null;
  const version = Number(match[2]);
  if (version > 2147483647) return null;
  return db.maybeOne<ExplicitStaffRequestNotification>(`SELECT r.conversation_id AS "conversationId",
    r.committed_version AS "committedVersion", r.explicit_request_evidence AS "explicitRequestEvidence"
    FROM team_ai_handoff_receipts r JOIN conversations c ON ${joinConversation}
    WHERE r.business_id=$1 AND r.conversation_id=$2 AND r.committed_version=$3 AND r.reason='customer_request'
      AND r.explicit_request_evidence IS NOT NULL AND ${stillQueued}`, [businessId, match[1], version]);
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
    const receipt = receiptValue(await tx.maybeOne<StoredReceipt>(`INSERT INTO team_ai_handoff_receipts AS r
      (business_id, conversation_id, turn_id, reason, expected_version, committed_version, explicit_request_evidence)
      VALUES ($1, $2, $3, $4, $5, $5::integer + 1, $6)
      ON CONFLICT (business_id, conversation_id, turn_id) DO NOTHING RETURNING ${receiptColumns}`, intentParams(intent)));
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
    // The exact database timestamp is the lease token. Each claim is made after expiry
    // and moves the deadline forward, including when a crashed worker is replaced.
    const target = await db.maybeOne<ReceiptKey & {
      customerId: string; version: number; reason: string; lease: string; active: boolean;
    }>(`UPDATE team_ai_handoff_receipts r SET notification_due_at = clock_timestamp() + interval '2 minutes'
      FROM conversations c WHERE ${joinConversation} AND ${receiptKey}
      AND r.notification_result IS NULL AND r.notification_due_at <= clock_timestamp()
      RETURNING ${receiptColumns}, c.customer_id AS "customerId", r.committed_version AS version,
        r.notification_due_at::text AS lease, (${stillQueued}) AS active`, keyParams(key));
    if (!target) return;
    const params = [...keyParams(key), target.lease];
    const ownsLease = 'r.notification_result IS NULL AND r.notification_due_at = $4::timestamptz AND r.notification_due_at > clock_timestamp()';
    const input = target.active ? await prepareHandoffNotification(target, target.reason) : null;
    // Refresh assignment and ownership after the potentially slow preparation, immediately before invoking F31.
    const current = await db.maybeOne<{ active: boolean }>(`SELECT (${stillQueued}) AS active
      FROM team_ai_handoff_receipts r JOIN conversations c ON ${joinConversation}
      WHERE ${receiptKey} AND ${ownsLease}`, params);
    if (!current) return;
    const mode = current.active && input ? (await notify(input)).mode : 'obsolete';
    await db.query(`UPDATE team_ai_handoff_receipts r SET notification_result = $5
      WHERE ${receiptKey} AND ${ownsLease}`, [...params, mode]);
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

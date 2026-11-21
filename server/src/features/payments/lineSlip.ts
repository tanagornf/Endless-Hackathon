import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import type { SlipAnalysis, SlipVerdict, SlipView } from '@nless/shared/features/payments/types';
import { AppError, auditInTransaction, db, decryptSecret, publish } from '../../core';
import type { DbExecutor } from '../../core';
import { notify } from '../notifications/service';
import { getOrderForPayment, lockOrderForPayment, setPaymentState } from '../orders/service';
import { runSlipPipeline } from './slip/pipeline';
import { normalizeRef } from './slip/qrparse';

type Request = {
  id: string; orderId: string; amountMinor: number;
  createdAt: Date; expiresAt: Date; receiverName: string; encryptedReceiver: string;
};
type SavedSlip = { requestId: string; verdict: SlipVerdict };

async function existingSlip(ex: DbExecutor, businessId: string, conversationId: string, fileId: string) {
  return ex.maybeOne<SavedSlip>(
    'SELECT s.payment_request_id AS "requestId", s.verdict FROM payment_slips s ' +
    'JOIN payment_requests r ON r.id = s.payment_request_id AND r.business_id = s.business_id ' +
    'WHERE s.business_id = $1 AND r.conversation_id = $2 AND s.file_id = $3',
    [businessId, conversationId, fileId],
  );
}

async function findPayableRequest(conversation: ConversationRecord, receivedAt: string, orderNumber?: string): Promise<Request | null> {
  const { rows } = await db.query<Request>(
    'SELECT id, order_id AS "orderId", amount_minor::float8 AS "amountMinor", created_at AS "createdAt", ' +
    'expires_at AS "expiresAt", receiver_name AS "receiverName", receiver_id_enc AS "encryptedReceiver" ' +
    "FROM payment_requests WHERE business_id = $1 AND conversation_id = $2 AND state IN ('open', 'pending_verification') " +
    'AND created_at <= $3 AND expires_at > now() ORDER BY created_at DESC LIMIT 6',
    [conversation.businessId, conversation.id, receivedAt],
  );
  // Do not guess if there are multiple payable orders or the list may be incomplete.
  if (!rows.length || rows.length === 6) return null;
  const orders = await Promise.all(rows.map((row) => getOrderForPayment(conversation.businessId, row.orderId)));
  const eligible = rows.flatMap((row, index) => {
    const order = orders[index];
    return (!orderNumber || order.orderNumber === orderNumber) && order.conversationId === conversation.id && order.customerId === conversation.customerId &&
      order.status === 'awaiting_payment' && ['unpaid', 'pending_verification'].includes(order.paymentState) &&
      order.totalMinor === row.amountMinor ? [row] : [];
  });
  return eligible.length === 1 ? eligible[0] : null;
}

function duplicate(result: SlipAnalysis): SlipAnalysis {
  return {
    ...result, verdict: 'duplicate', autoAcceptable: false, needsStaffReason: 'duplicate_reference',
    checks: result.checks.map((check) => check.name === 'duplicate' ? { ...check, pass: false, detail: 'seen before' } : check),
  };
}

async function saveSlip(conversation: ConversationRecord, request: Request, fileId: string, analysis: SlipAnalysis) {
  const { businessId, id: conversationId } = conversation;
  return db.tx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['payment-slip:' + businessId + ':' + fileId]);
    const existing = await existingSlip(tx, businessId, conversationId, fileId);
    if (existing) return existing;
    const live = await tx.maybeOne<{ state: string }>(
      "SELECT state FROM payment_requests WHERE business_id = $1 AND id = $2 AND conversation_id = $3 " +
      "AND state IN ('open', 'pending_verification') AND expires_at > now() FOR UPDATE",
      [businessId, request.id, conversationId],
    );
    if (!live) return null;
    const order = await lockOrderForPayment(businessId, request.orderId, tx);
    if (order.conversationId !== conversationId || order.customerId !== conversation.customerId ||
      order.status !== 'awaiting_payment' || !['unpaid', 'pending_verification'].includes(order.paymentState) ||
      order.totalMinor !== request.amountMinor) return null;

    const slipId = await tx.one<{ id: string }>('SELECT gen_random_uuid() AS id');
    let result = analysis;
    const ref = normalizeRef(result.transactionRef ?? '');
    if (result.mode === 'vision' && result.verdict === 'verified' && ref) {
      const claim = await tx.query(
        'INSERT INTO slip_refs (business_id, ref_key, source, payment_slip_id) VALUES ($1, $2, $3, $4) ' +
        'ON CONFLICT (business_id, ref_key) DO NOTHING RETURNING ref_key',
        [businessId, ref, result.qr.found ? 'qr' : 'vision', slipId.id],
      );
      if (!claim.rowCount) result = duplicate(result);
    }
    await tx.query(
      'INSERT INTO payment_slips (id, business_id, payment_request_id, order_id, file_id, uploaded_by_kind, ' +
      'verdict, mode, confidence, auto_acceptable, amount_minor, transferred_at, transaction_ref, qr_found, qr_sending_bank, ' +
      'receiver_name, receiver_last4, checks, needs_staff_reason) ' +
      "VALUES ($1,$2,$3,$4,$5,'customer',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18)",
      [slipId.id, businessId, request.id, request.orderId, fileId, result.verdict, result.mode,
        result.confidence, result.autoAcceptable, result.amountMinor, result.transferredAt, result.transactionRef,
        result.qr.found, result.qr.sendingBank, result.receiverName, result.receiverLast4, JSON.stringify(result.checks),
        result.needsStaffReason],
    );
    if (order.paymentState === 'unpaid') {
      await setPaymentState({ businessId, orderId: request.orderId, to: 'pending_verification', actor: { kind: 'system' }, tx });
    }
    await tx.query(
      "UPDATE payment_requests SET state = 'pending_verification', updated_at = now(), version = version + 1 " +
      "WHERE business_id = $1 AND id = $2 AND state = 'open'",
      [businessId, request.id],
    );
    await auditInTransaction(tx, [{
      action: 'payments.line_slip.received', businessId, actorUserId: null, targetType: 'payment_request', targetId: request.id,
      details: { slipId: slipId.id, verdict: result.verdict, mode: result.mode },
    }]);
    return { requestId: request.id, verdict: result.verdict };
  });
}

export async function submitLineSlip(
  conversation: ConversationRecord, inbound: MessageRecord, fileId: string, language: 'th' | 'en', signal: AbortSignal,
  orderNumber?: string,
): Promise<boolean> {
  const { businessId, id: conversationId } = conversation;
  if (conversation.channel !== 'line' || inbound.businessId !== businessId || inbound.conversationId !== conversationId ||
    inbound.author !== 'customer' || inbound.direction !== 'inbound' ||
    !inbound.parts.some((part) => part.type === 'image' && part.fileId === fileId)) return false;

  let saved = await existingSlip(db, businessId, conversationId, fileId);
  if (!saved) {
    const request = await findPayableRequest(conversation, inbound.createdAt, orderNumber);
    if (request) {
      signal.throwIfAborted();
      const analysis = await runSlipPipeline({
        businessId, fileId, dryRun: true,
        expected: {
          amountMinor: request.amountMinor, receiverPromptPayId: decryptSecret(request.encryptedReceiver),
          receiverName: request.receiverName, notBefore: request.createdAt.toISOString(),
          notAfter: new Date(Math.min(request.expiresAt.getTime(), Date.parse(inbound.createdAt) + 60_000)).toISOString(),
        },
      }, signal);
      signal.throwIfAborted();
      saved = await saveSlip(conversation, request, fileId, analysis);
    }
  }
  await notify({
    businessId, to: { permission: 'orders.read' }, type: 'payment.verifying',
    title: saved
      ? language === 'th' ? 'มีสลิป LINE รอตรวจสอบ' : 'LINE slip awaiting review'
      : language === 'th' ? 'มีสลิป LINE ที่ยังระบุออเดอร์ไม่ได้' : 'LINE slip needs an order number',
    link: saved ? '/payments?request=' + saved.requestId : '/chat?c=' + conversationId,
    dedupKey: 'f14-line-slip:' + businessId + ':' + fileId,
  });
  if (saved) await publish(businessId, { type: 'custom', featureId: 'F14', name: 'payments.changed', data: { requestId: saved.requestId } });
  return Boolean(saved);
}

export async function listSlipsForPayment(businessId: string, requestId: string): Promise<SlipView[]> {
  const { rows } = await db.query<Omit<SlipView, 'createdAt' | 'transferredAt'> & { createdAt: Date; transferredAt: Date | null }>(
    'SELECT id, verdict, mode, confidence::float8 AS confidence, auto_acceptable AS "autoAcceptable", ' +
    'amount_minor::float8 AS "amountMinor", transferred_at AS "transferredAt", ' +
    "CASE WHEN transaction_ref IS NOT NULL THEN '…' || right(transaction_ref, 4) END AS \"transactionRefMasked\", " +
    'qr_found AS "qrFound", qr_sending_bank AS "qrSendingBank", receiver_name AS "receiverName", ' +
    'receiver_last4 AS "receiverLast4", checks, needs_staff_reason AS "needsStaffReason", staff_decision AS "staffDecision", ' +
    'staff_note AS "staffNote", uploaded_by_kind AS "uploadedByKind", created_at AS "createdAt" ' +
    'FROM payment_slips WHERE business_id = $1 AND payment_request_id = $2 ORDER BY created_at DESC, id DESC',
    [businessId, requestId],
  );
  return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString(), transferredAt: row.transferredAt?.toISOString() ?? null }));
}

export type SlipReviewDecision = { decision: 'accepted'; bankConfirmed: true } | { decision: 'rejected' };

export async function decideLineSlip(
  businessId: string, userId: string, requestId: string, slipId: string, input: SlipReviewDecision,
) {
  const changed = await db.tx(async (tx) => {
    const request = await tx.maybeOne<{ state: string; orderId: string; amountMinor: number; mode: 'real' | 'sandbox' }>(
      'SELECT state, order_id AS "orderId", amount_minor::float8 AS "amountMinor", mode ' +
      'FROM payment_requests WHERE business_id = $1 AND id = $2 FOR UPDATE', [businessId, requestId],
    );
    if (!request) throw new AppError('NOT_FOUND', 'Payment request not found');
    const slip = await tx.maybeOne<{ staffDecision: SlipReviewDecision['decision'] | null; verdict: SlipVerdict }>(
      'SELECT staff_decision AS "staffDecision", verdict FROM payment_slips WHERE business_id = $1 AND payment_request_id = $2 AND id = $3',
      [businessId, requestId, slipId],
    );
    if (!slip) throw new AppError('NOT_FOUND', 'Payment slip not found');
    if (slip.staffDecision === input.decision) return false;
    if (slip.staffDecision || request.state !== 'pending_verification' ||
      (input.decision === 'accepted' && slip.verdict === 'duplicate')) {
      throw new AppError('POLICY_BLOCKED', 'Payment slip is no longer awaiting review');
    }
    const order = await lockOrderForPayment(businessId, request.orderId, tx);
    if (order.status !== 'awaiting_payment' || order.paymentState !== 'pending_verification' ||
      order.totalMinor !== request.amountMinor) throw new AppError('POLICY_BLOCKED', 'Order is no longer awaiting payment review');
    await tx.query(
      'UPDATE payment_slips SET staff_decision = $4, staff_decided_by = $5, staff_decided_at = now() ' +
      'WHERE business_id = $1 AND payment_request_id = $2 AND id = $3',
      [businessId, requestId, slipId, input.decision, userId],
    );
    const actor = { kind: 'staff', userId } as const;
    if (input.decision === 'accepted') {
      await setPaymentState({ businessId, orderId: request.orderId, to: 'paid', actor, tx });
      await tx.query(
        "UPDATE payment_requests SET state = 'paid', paid_at = now(), paid_by = 'staff_accept', " +
        'updated_at = now(), version = version + 1 WHERE business_id = $1 AND id = $2',
        [businessId, requestId],
      );
      await tx.query(
        'INSERT INTO payment_receipts (business_id, payment_request_id, order_id, receipt_no, amount_minor, paid_at, paid_by, mode) ' +
        "VALUES ($1,$2,$3,$4,$5,now(),'staff_accept',$6)",
        [businessId, requestId, request.orderId, order.orderNumber + '-R1', request.amountMinor, request.mode],
      );
    } else {
      const remaining = await tx.maybeOne(
        'SELECT id FROM payment_slips WHERE business_id = $1 AND payment_request_id = $2 AND staff_decision IS NULL LIMIT 1',
        [businessId, requestId],
      );
      if (!remaining) {
        await setPaymentState({ businessId, orderId: request.orderId, to: 'unpaid', actor, tx });
        await tx.query(
          "UPDATE payment_requests SET state = CASE WHEN expires_at > now() THEN 'open' ELSE 'expired' END, " +
          'updated_at = now(), version = version + 1 WHERE business_id = $1 AND id = $2',
          [businessId, requestId],
        );
      }
    }
    await auditInTransaction(tx, [{
      action: 'payments.line_slip.reviewed', businessId, actorUserId: userId, targetType: 'payment_request', targetId: requestId,
      details: { slipId, decision: input.decision },
    }]);
    return true;
  });
  if (changed) await publish(businessId, { type: 'custom', featureId: 'F14', name: 'payments.changed', data: { requestId } });
}

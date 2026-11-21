import { z } from 'zod';
import { AppError, auditInTransaction, db } from '../../core';
import type { DbExecutor } from '../../core';
import { getConversation } from '../inbox/service';
import type { AuthScope } from '@nless/shared/core/types';
import type {
  AnswerOwnerConsultInput, OpenOwnerConsultInput, OpenOwnerConsultResult, OwnerConsultActionKey,
  OwnerConsultAnswerReceipt, OwnerConsultReuse, OwnerConsultView,
} from '@nless/shared/features/business-settings/types';

const initialStep = 'initial';
const id = z.uuid();
const actionStepId = z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/);
const openInput = z.object({
  businessId: id, conversationId: id, triggerMessageId: id,
  question: z.string().trim().min(1).max(1200), language: z.enum(['th', 'en']),
}).strict();
const keyInput = z.object({ businessId: id, caseId: id, actionStepId }).strict();
export const OwnerConsultAnswerBody = z.object({
  actionStepId, expectedVersion: z.number().int().min(1).max(2_147_483_646),
  clientRequestId: z.string().min(1).max(100).regex(/^[A-Za-z0-9:_-]+$/),
  answer: z.string().trim().min(1).max(2000),
  reuse: z.enum(['case_only', 'propose_draft']).default('case_only'),
}).strict();

function notFound(): never {
  throw new AppError('NOT_FOUND', 'Owner consultation not found');
}

async function requireCurrentOwner(tx: DbExecutor, scope: AuthScope): Promise<string> {
  if (!scope.businessId || scope.role !== 'owner') throw new AppError('PERMISSION_DENIED', 'Business owner required');
  const owner = await tx.maybeOne(
    'SELECT 1 FROM memberships m JOIN users u ON u.id=m.user_id JOIN businesses b ON b.id=m.business_id ' +
    'JOIN accounts a ON a.id=b.account_id WHERE m.business_id=$1 AND m.user_id=$2 AND a.id=$3 ' +
    "AND m.role='owner' AND m.status='active' AND u.status='active' AND b.status='active' AND a.status='active' FOR SHARE OF m",
    [scope.businessId, scope.userId, scope.accountId],
  );
  if (!owner) throw new AppError('PERMISSION_DENIED', 'Business owner required');
  return scope.businessId;
}

export async function openOwnerConsult(input: OpenOwnerConsultInput): Promise<OpenOwnerConsultResult> {
  const { businessId, conversationId, triggerMessageId, question, language } = openInput.parse(input);
  return db.tx(async (tx) => {
    // Verify only the IDs and channel against core. No customer text is copied from the message.
    const source = await tx.maybeOne(
      'SELECT 1 FROM messages m JOIN conversations c ON c.id=m.conversation_id AND c.business_id=m.business_id ' +
      'JOIN businesses b ON b.id=m.business_id JOIN accounts a ON a.id=b.account_id ' +
      "WHERE m.business_id=$1 AND c.id=$2 AND m.id=$3 AND m.direction='inbound' AND m.author='customer' " +
      "AND m.channel='line' AND c.channel='line' AND b.status='active' AND a.status='active'",
      [businessId, conversationId, triggerMessageId],
    );
    if (!source) notFound();
    const created = await tx.maybeOne<{ caseId: string }>(
      'INSERT INTO owner_consult_cases(business_id,conversation_id,trigger_message_id,language) VALUES($1,$2,$3,$4) ' +
      'ON CONFLICT(business_id,trigger_message_id) DO NOTHING RETURNING id AS "caseId"',
      [businessId, conversationId, triggerMessageId, language],
    );
    if (!created) {
      const existing = await tx.one<Omit<OpenOwnerConsultResult, 'created'>>(
        'SELECT c.id AS "caseId",s.action_step_id AS "actionStepId",s.version ' +
        'FROM owner_consult_cases c JOIN owner_consult_steps s ON (s.business_id,s.case_id)=(c.business_id,c.id) ' +
        'WHERE c.business_id=$1 AND c.trigger_message_id=$2 AND s.action_step_id=$3',
        [businessId, triggerMessageId, initialStep],
      );
      return { ...existing, created: false };
    }
    await tx.query(
      'INSERT INTO owner_consult_steps(business_id,case_id,action_step_id,question) VALUES($1,$2,$3,$4)',
      [businessId, created.caseId, initialStep, question],
    );
    await tx.query('INSERT INTO owner_consult_outbox(business_id,case_id,action_step_id) VALUES($1,$2,$3)',
      [businessId, created.caseId, initialStep]);
    return { caseId: created.caseId, actionStepId: initialStep, version: 1, created: true };
  });
}

async function conversationIsActionable(businessId: string, conversationId: string): Promise<boolean> {
  const conversation = await getConversation(conversationId, { businessId });
  return conversation?.channel === 'line' && conversation.status === 'open' && conversation.handler === 'ai';
}

export async function isOwnerConsultActionPending(key: OwnerConsultActionKey): Promise<boolean> {
  if (!keyInput.safeParse(key).success) return false;
  const row = await db.maybeOne<{ conversationId: string }>(
    'SELECT c.conversation_id AS "conversationId" FROM owner_consult_steps s ' +
    'JOIN owner_consult_cases c ON (c.business_id,c.id)=(s.business_id,s.case_id) JOIN businesses b ON b.id=s.business_id ' +
    "JOIN accounts a ON a.id=b.account_id WHERE s.business_id=$1 AND s.case_id=$2 AND s.action_step_id=$3 " +
    "AND s.state='pending' AND b.status='active' AND a.status='active'",
    [key.businessId, key.caseId, key.actionStepId],
  );
  return row ? conversationIsActionable(key.businessId, row.conversationId) : false;
}

export async function getOwnerConsult(scope: AuthScope, caseId: string): Promise<OwnerConsultView> {
  if (!id.safeParse(caseId).success) notFound();
  const { businessId, conversationId, ...view } = await db.tx(async (tx) => {
    const businessId = await requireCurrentOwner(tx, scope);
    const row = await tx.maybeOne<OwnerConsultView & { conversationId: string }>(
      'SELECT c.id AS "caseId",c.conversation_id AS "conversationId",s.action_step_id AS "actionStepId",' +
      's.version,s.state,c.language,s.question,s.answer,s.reuse ' +
      'FROM owner_consult_cases c JOIN owner_consult_steps s ON (s.business_id,s.case_id)=(c.business_id,c.id) ' +
      "WHERE c.business_id=$1 AND c.id=$2 ORDER BY (s.state='pending') DESC,s.created_at DESC,s.action_step_id LIMIT 1",
      [businessId, caseId],
    );
    if (!row) notFound();
    return { ...row, businessId };
  });
  if (view.state === 'pending' && !await conversationIsActionable(businessId, conversationId)) notFound();
  return view;
}

type LockedStep = {
  state: 'pending' | 'answered';
  version: number;
  answer: string | null;
  answer_request_id: string | null;
  answer_receipt_id: string | null;
  answered_by: string | null;
  reuse: OwnerConsultReuse | null;
};

export async function answerOwnerConsult(scope: AuthScope, input: AnswerOwnerConsultInput): Promise<OwnerConsultAnswerReceipt> {
  const { caseId, ...change } = input;
  if (!id.safeParse(caseId).success) notFound();
  const { actionStepId, expectedVersion, clientRequestId, answer, reuse } = OwnerConsultAnswerBody.parse(change);
  return db.tx(async (tx) => {
    const businessId = await requireCurrentOwner(tx, scope);
    const key = [businessId, caseId, actionStepId];
    const step = await tx.maybeOne<LockedStep>(
      'SELECT state,version,answer,answer_request_id,answer_receipt_id,answered_by,reuse FROM owner_consult_steps ' +
      'WHERE business_id=$1 AND case_id=$2 AND action_step_id=$3 FOR UPDATE', key,
    );
    if (!step) notFound();
    if (step.answer_request_id === clientRequestId && step.answered_by === scope.userId) {
      if (step.version !== expectedVersion + 1 || step.answer !== answer || step.reuse !== reuse) {
        throw new AppError('IDEMPOTENCY_CONFLICT', 'Owner consultation request already used');
      }
      return { caseId, version: step.version, state: 'answered', answerReceiptId: step.answer_receipt_id!, reuse };
    }
    if (step.state !== 'pending' || step.version !== expectedVersion) {
      throw new AppError('VERSION_CONFLICT', 'Owner consultation action has changed', { details: { version: step.version } });
    }
    const receipt = await tx.one<{ answerReceiptId: string; version: number }>(
      "UPDATE owner_consult_steps SET state='answered',version=version+1,answer=$4,answer_request_id=$5," +
      'answered_by=$6,answered_at=now(),reuse=$7,answer_receipt_id=gen_random_uuid() ' +
      'WHERE business_id=$1 AND case_id=$2 AND action_step_id=$3 RETURNING answer_receipt_id AS "answerReceiptId",version',
      [...key, answer, clientRequestId, scope.userId, reuse],
    );
    await auditInTransaction(tx, [{
      action: 'business-settings.owner_consult.answer', actorUserId: scope.userId,
      businessId, accountId: scope.accountId, targetType: 'owner_consult', targetId: caseId,
      details: { actionStepId, answerReceiptId: receipt.answerReceiptId, reuse, version: receipt.version },
    }]);
    return { caseId, ...receipt, state: 'answered', reuse };
  });
}

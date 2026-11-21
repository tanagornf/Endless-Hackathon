import { z } from 'zod';
import { db } from '../../core';
import type { OwnerConsultAnswerForResume, OwnerConsultAnswerKey } from '@nless/shared/features/business-settings/types';

const answerKey = z.object({
  businessId: z.uuid(), caseId: z.uuid(), answerReceiptId: z.uuid(),
  actionStepId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
}).strict();

/** Internal read for F10. Its job must verify the tenant before requesting this private receipt. */
export async function readOwnerConsultAnswer(key: OwnerConsultAnswerKey): Promise<OwnerConsultAnswerForResume | null> {
  if (!answerKey.safeParse(key).success) return null;
  return db.maybeOne<OwnerConsultAnswerForResume>(
    'SELECT s.business_id AS "businessId",s.case_id AS "caseId",s.action_step_id AS "actionStepId",' +
    's.answer_receipt_id AS "answerReceiptId",c.conversation_id AS "conversationId",c.trigger_message_id AS "triggerMessageId",' +
    'c.language,s.answer,s.reuse,s.version FROM owner_consult_steps s ' +
    'JOIN owner_consult_cases c ON (c.business_id,c.id)=(s.business_id,s.case_id) ' +
    'JOIN businesses b ON b.id=s.business_id JOIN accounts a ON a.id=b.account_id ' +
    "WHERE s.business_id=$1 AND s.case_id=$2 AND s.action_step_id=$3 AND s.answer_receipt_id=$4 AND s.state='answered' " +
    "AND s.customer_ready_at IS NOT NULL AND b.status='active' AND a.status='active' AND NOT EXISTS (" +
    'SELECT 1 FROM owner_consult_steps newer WHERE (newer.business_id,newer.case_id)=(s.business_id,s.case_id) ' +
    'AND (newer.created_at,newer.action_step_id)>(s.created_at,s.action_step_id))',
    [key.businessId, key.caseId, key.actionStepId, key.answerReceiptId],
  );
}

/** Re-read at each learning boundary. Draft permission is separate from approval of a specific publication. */
export async function withOwnerConsultDraftConsent<T>(
  key: OwnerConsultAnswerKey,
  action: (receipt: OwnerConsultAnswerForResume & { reuse: 'propose_draft' }) => T | Promise<T>,
): Promise<T | null> {
  const receipt = await readOwnerConsultAnswer(key);
  if (receipt?.reuse !== 'propose_draft') return null;
  return action({ ...receipt, reuse: receipt.reuse });
}

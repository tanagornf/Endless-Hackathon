import { db, jobs, log } from '../../core';
import type { ScheduleDefinition } from '../../core';
import { OWNER_CONSULT_ANSWER_JOB } from '@nless/shared/features/business-settings/types';
import type { OwnerConsultAnswerKey } from '@nless/shared/features/business-settings/types';

type ClaimedAnswer = OwnerConsultAnswerKey & { conversationId: string; attempts: number };
let consumerRegistered = false;

/** F10 calls this at boot alongside registration of its guarded resume job. */
export function registerOwnerConsultAnswerConsumer(): void {
  consumerRegistered = true;
}

function claimAnswer(): Promise<ClaimedAnswer | null> {
  return db.maybeOne<ClaimedAnswer>(
    'WITH due AS (SELECT o.business_id,o.case_id,o.action_step_id,o.answer_receipt_id,c.conversation_id ' +
    'FROM owner_consult_answer_outbox o JOIN owner_consult_cases c ON (c.business_id,c.id)=(o.business_id,o.case_id) ' +
    'WHERE o.queued_at IS NULL AND o.next_attempt_at<=now() ' +
    'ORDER BY o.next_attempt_at,o.business_id,o.case_id,o.action_step_id LIMIT 1 FOR UPDATE OF o SKIP LOCKED) ' +
    "UPDATE owner_consult_answer_outbox o SET attempts=o.attempts+1,next_attempt_at=now()+interval '2 minutes' " +
    'FROM due WHERE (o.business_id,o.case_id,o.action_step_id)=(due.business_id,due.case_id,due.action_step_id) ' +
    'RETURNING o.business_id AS "businessId",o.case_id AS "caseId",o.action_step_id AS "actionStepId",' +
    'o.answer_receipt_id AS "answerReceiptId",due.conversation_id AS "conversationId",o.attempts',
  );
}

export async function flushOwnerConsultAnswerOutbox(signal?: AbortSignal): Promise<void> {
  if (!consumerRegistered) return;
  for (let count = 0; count < 20 && !signal?.aborted; count++) {
    const claimed = await claimAnswer();
    if (!claimed) return;
    const { conversationId, attempts, ...key } = claimed;
    const { businessId, caseId, actionStepId, answerReceiptId } = key;
    try {
      const { jobId } = await jobs.enqueue(OWNER_CONSULT_ANSWER_JOB, key, {
        businessId,
        dedupKey: 'ai-owner-answer:' + businessId + ':' + answerReceiptId,
        lockKey: 'conversation:' + conversationId,
      });
      await db.query(
        'UPDATE owner_consult_answer_outbox SET queued_at=now(),job_id=$6 ' +
        'WHERE business_id=$1 AND case_id=$2 AND action_step_id=$3 AND answer_receipt_id=$4 AND attempts=$5 AND queued_at IS NULL',
        [businessId, caseId, actionStepId, answerReceiptId, attempts, jobId],
      );
    } catch {
      log.warn({ businessId, caseId, actionStepId, answerReceiptId }, 'Owner answer handoff was not confirmed');
    }
  }
}

export const ownerConsultAnswerSchedule: ScheduleDefinition = {
  name: 'business-settings.owner-consult-answer-outbox',
  everySeconds: 30,
  handler: async ({ signal }) => flushOwnerConsultAnswerOutbox(signal),
};

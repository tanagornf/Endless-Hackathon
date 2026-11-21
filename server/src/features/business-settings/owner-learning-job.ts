import { AppError, db, jobs, model } from '../../core';
import type { JobHandler, ScheduleDefinition } from '../../core';
import { prepareOwnerLearningDraft, type OwnerLearningDraftInput } from './owner-learning-draft';

export const ownerLearningJob = 'business-settings.owner-learning-draft';

export const runOwnerLearning: JobHandler<OwnerLearningDraftInput> = async ({ businessId, payload, signal }) => {
  if (!businessId || businessId !== payload?.businessId) throw new AppError('VALIDATION_ERROR', 'Owner learning job scope mismatch');
  const result = await prepareOwnerLearningDraft(payload, {
    signal, analyze: async input => (await model.analyzeShopCorrection(input)).json,
  });
  if (result.kind === 'skipped' && result.reason === 'invalid_candidate') {
    throw new AppError('VALIDATION_ERROR', 'Owner learning analysis did not return a valid reusable FAQ');
  }
};

// A committed, reviewed answer is itself a durable dispatch record. Older consenting
// answers and interrupted dispatches use the same receipt-specific queue key.
export const ownerLearningSchedule: ScheduleDefinition = {
  name: 'business-settings.dispatch-owner-learning',
  everySeconds: 30,
  async handler({ signal }) {
    const { rows } = await db.query<OwnerLearningDraftInput>(
      `SELECT business_id AS "businessId", case_id AS "caseId", action_step_id AS "actionStepId",
              answer_receipt_id AS "answerReceiptId", version AS "expectedVersion"
         FROM owner_consult_steps
        WHERE reuse='propose_draft' AND state='answered' AND customer_ready_at IS NOT NULL AND learning_queued_at IS NULL
        ORDER BY answered_at, answer_receipt_id LIMIT 25`,
    );
    for (const key of rows) {
      signal.throwIfAborted();
      await jobs.enqueue(ownerLearningJob, key, {
        businessId: key.businessId, dedupKey: 'owner-learning:' + key.answerReceiptId,
      });
      await db.query(
        'UPDATE owner_consult_steps SET learning_queued_at=now() WHERE business_id=$1 AND answer_receipt_id=$2 AND learning_queued_at IS NULL',
        [key.businessId, key.answerReceiptId],
      );
    }
  },
};

import { db, log } from '../../core';
import type { ScheduleDefinition } from '../../core';
import type { OwnerConsultActionKey } from '@nless/shared/features/business-settings/types';
import { notify } from '../notifications/service';
import { isOwnerConsultActionPending } from './owner-consult';

type ClaimedNotice = OwnerConsultActionKey & { language: 'th' | 'en'; attempts: number };

function claimNotice(): Promise<ClaimedNotice | null> {
  return db.maybeOne<ClaimedNotice>(
    "WITH due AS (SELECT o.business_id,o.case_id,o.action_step_id,b.language FROM owner_consult_outbox o " +
    'JOIN owner_consult_steps s ON (s.business_id,s.case_id,s.action_step_id)=(o.business_id,o.case_id,o.action_step_id) ' +
    'JOIN businesses b ON b.id=o.business_id JOIN accounts a ON a.id=b.account_id ' +
    "WHERE o.delivered_at IS NULL AND o.next_attempt_at<=now() AND s.state='pending' AND b.status='active' AND a.status='active' " +
    'ORDER BY o.next_attempt_at,o.business_id,o.case_id,o.action_step_id LIMIT 1 FOR UPDATE OF o SKIP LOCKED) ' +
    "UPDATE owner_consult_outbox o SET attempts=o.attempts+1,next_attempt_at=now()+interval '2 minutes' " +
    'FROM due WHERE (o.business_id,o.case_id,o.action_step_id)=(due.business_id,due.case_id,due.action_step_id) ' +
    'RETURNING o.business_id AS "businessId",o.case_id AS "caseId",o.action_step_id AS "actionStepId",due.language,o.attempts',
  );
}

export async function flushOwnerConsultOutbox(signal?: AbortSignal): Promise<void> {
  for (let count = 0; count < 20 && !signal?.aborted; count++) {
    const notice = await claimNotice();
    if (!notice) return;
    const { businessId, caseId, actionStepId, language, attempts } = notice;
    try {
      if (!await isOwnerConsultActionPending({ businessId, caseId, actionStepId })) continue;
      const result = await notify({
        businessId,
        type: 'system',
        to: { role: 'owners' },
        title: language === 'th' ? 'ผู้ช่วยมีคำถามถึงเจ้าของร้าน' : 'The assistant has a question for the owner',
        body: language === 'th' ? 'เปิดการตั้งค่าผู้ช่วยเพื่อตอบคำถาม' : 'Open bot settings to answer the question.',
        link: '/bot-settings?consult=' + caseId,
        dedupKey: 'ai-owner-review:' + businessId + ':' + caseId + ':' + actionStepId,
      });
      // The current F31 port may return no receipt. The leased row remains eligible for recovery.
      if (result.mode !== 'real' || !result.notificationIds.length) continue;
      await db.query(
        'UPDATE owner_consult_outbox SET delivered_at=now() WHERE business_id=$1 AND case_id=$2 AND action_step_id=$3 ' +
        'AND attempts=$4 AND delivered_at IS NULL',
        [businessId, caseId, actionStepId, attempts],
      );
    } catch {
      log.warn({ businessId, caseId, actionStepId }, 'Owner consultation notification was not confirmed');
    }
  }
}

export const ownerConsultSchedule: ScheduleDefinition = {
  name: 'business-settings.owner-consult-outbox',
  everySeconds: 30,
  handler: async ({ signal }) => flushOwnerConsultOutbox(signal),
};

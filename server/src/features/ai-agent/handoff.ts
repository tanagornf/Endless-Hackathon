import type { CustomerLanguage } from '@nless/shared/core/language';
import type { ConversationRecord } from '@nless/shared/features/inbox/types';
import type { AssignmentResult } from '@nless/shared/features/team/types';
import { audit, log } from '../../core';
import { getEffectiveAnswerRules } from '../business-settings/service';
import { notify } from '../notifications/service';
import { requestHumanHandoff } from '../team/service';
import { recordHandoff } from './repo';
import type { HandoffCheckpoint, HandoffReason, TurnLease } from './repo';

const staffTitles = {
  customer_request: { th: 'ลูกค้าขอคุยกับพนักงาน', en: 'Customer asked for a person' },
  budget_exhausted: { th: 'AI หยุดตอบ: วงเงิน API หมด', en: 'AI stopped: API budget exhausted' },
  ai_failed: { th: 'AI ตอบไม่สำเร็จหลังลอง 3 ครั้ง', en: 'AI failed to answer after 3 attempts' },
};

export function staffHandoffTitle(reason: HandoffReason, language: CustomerLanguage): string {
  return staffTitles[reason][language];
}

export async function canRequestHandoff(businessId: string): Promise<boolean> {
  return process.env.ESCALATION_ENABLED !== '0' && (await getEffectiveAnswerRules(businessId)).handoff;
}

type HandoffResult =
  | { status: 'recorded'; checkpoint: HandoffCheckpoint }
  | { status: 'stale' }
  | { status: 'lost' };

export async function beginHandoff(
  turn: TurnLease,
  conversation: ConversationRecord,
  reason: HandoffReason,
  shopLanguage: CustomerLanguage,
  signal: AbortSignal,
): Promise<HandoffResult> {
  const { id: conversationId, businessId } = conversation;
  signal.throwIfAborted();
  let assignment: AssignmentResult | undefined;
  try {
    assignment = await requestHumanHandoff(conversationId, { reason, actor: 'ai' }, { businessId });
  } catch {
    log.warn({ turnId: turn.id }, 'Team handoff failed, opening a fallback wait');
  }
  if (assignment && (
    assignment.conversationId !== conversationId || assignment.handler !== 'human' ||
    assignment.assigneeUserId !== null || assignment.version !== conversation.version + 1
  )) {
    // F11 can return an existing assignment. It is not permission for this turn to acknowledge a manual takeover.
    return { status: 'stale' };
  }
  const version = assignment?.version ?? null;
  if (!(await recordHandoff(turn, reason, version))) return { status: 'lost' };
  if (!assignment) {
    await notify({
      businessId, to: { permission: 'chat.takeover' }, type: 'chat.handoff',
      title: staffHandoffTitle(reason, shopLanguage), body: conversation.customer.displayName || undefined,
      link: '/chat?c=' + conversationId, dedupKey: 'handoff:' + turn.id,
    }).catch(() => log.warn({ turnId: turn.id }, 'Fallback handoff notification failed'));
  }
  await audit({
    action: 'ai-agent.handoff.requested', actorUserId: null, businessId,
    targetType: 'conversation', targetId: conversationId, details: { reason, turnId: turn.id },
  }).catch(() => log.warn({ turnId: turn.id }, 'Handoff audit could not be written'));
  return { status: 'recorded', checkpoint: { turnId: turn.id, version } };
}

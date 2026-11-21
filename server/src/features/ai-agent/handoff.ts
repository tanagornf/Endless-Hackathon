import type { CustomerLanguage } from '@nless/shared/core/language';
import type { ConversationRecord } from '@nless/shared/features/inbox/types';
import type { AiHandoffIntent, AiHandoffReceipt, ExplicitStaffRequestEvidence } from '@nless/shared/features/team/types';
import { audit, log } from '../../core';
import { getEffectiveAnswerRules } from '../business-settings/service';
import { getConversation } from '../inbox/service';
import { notify } from '../notifications/service';
import { applyAiHandoff, getAiHandoffReceipt } from '../team/service';
import { prepareHandoff, recordHandoff } from './repo';
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

function intentFor(turn: TurnLease, reason: HandoffReason, expectedVersion: number, evidence?: ExplicitStaffRequestEvidence): AiHandoffIntent {
  return { businessId: turn.business_id, conversationId: turn.conversation_id, turnId: turn.id, reason, expectedVersion,
    ...(evidence ? { explicitRequestEvidence: evidence } : {}) };
}

function checkpointOf(intent: AiHandoffIntent, receipt: AiHandoffReceipt | null): HandoffCheckpoint | null {
  if (!receipt || receipt.businessId !== intent.businessId || receipt.conversationId !== intent.conversationId ||
    receipt.turnId !== intent.turnId || receipt.reason !== intent.reason || receipt.expectedVersion !== intent.expectedVersion ||
    receipt.committedVersion !== intent.expectedVersion + 1 || receipt.explicitRequestEvidence !== intent.explicitRequestEvidence) return null;
  return { turnId: intent.turnId, version: receipt.committedVersion };
}

export async function recoverHandoff(turn: TurnLease, reason: HandoffReason, expectedVersion: number, evidence?: ExplicitStaffRequestEvidence): Promise<HandoffCheckpoint | null> {
  const intent = intentFor(turn, reason, expectedVersion, evidence);
  return checkpointOf(intent, await getAiHandoffReceipt(intent));
}

export async function persistHandoff(turn: TurnLease, reason: HandoffReason, checkpoint: HandoffCheckpoint): Promise<boolean> {
  if (!(await recordHandoff(turn, reason, checkpoint.version))) return false;
  await audit({
    action: 'ai-agent.handoff.requested', actorUserId: null, businessId: turn.business_id,
    targetType: 'conversation', targetId: turn.conversation_id, details: { reason, turnId: turn.id },
  }).catch(() => log.warn({ turnId: turn.id }, 'Handoff audit could not be written'));
  return true;
}

export async function beginHandoff(
  turn: TurnLease,
  conversation: ConversationRecord,
  reason: HandoffReason,
  expectedVersion: number,
  shopLanguage: CustomerLanguage,
  signal: AbortSignal,
  evidence?: ExplicitStaffRequestEvidence,
): Promise<HandoffResult> {
  const { id: conversationId, businessId } = conversation;
  signal.throwIfAborted();
  if (conversation.version !== expectedVersion) return { status: 'stale' };
  if (!(await prepareHandoff(turn, reason, expectedVersion))) return { status: 'lost' };
  const intent = intentFor(turn, reason, expectedVersion, evidence);
  let checkpoint: HandoffCheckpoint | null;
  try {
    signal.throwIfAborted();
    checkpoint = checkpointOf(intent, await applyAiHandoff(intent));
  } catch {
    signal.throwIfAborted();
    checkpoint = await recoverHandoff(turn, reason, expectedVersion, evidence);
    if (!checkpoint) {
      // Only an unchanged AI assignment proves no handoff committed. An
      // intervening staff claim or handback must never produce a fallback ACK.
      const current = await getConversation(conversationId, { businessId });
      if (current?.status !== 'open' || current.handler !== 'ai' || current.version !== expectedVersion) {
        return { status: 'stale' };
      }
      log.warn({ turnId: turn.id }, 'Team handoff failed, opening a fallback wait');
      checkpoint = { turnId: turn.id, version: null };
    }
  }
  signal.throwIfAborted();
  if (!checkpoint) return { status: 'stale' };
  if (!(await persistHandoff(turn, reason, checkpoint))) return { status: 'lost' };
  if (checkpoint.version === null) {
    await notify({
      businessId, to: { permission: 'chat.takeover' }, type: 'chat.handoff',
      title: staffHandoffTitle(reason, shopLanguage), body: conversation.customer.displayName || undefined,
      link: '/chat?c=' + conversationId, dedupKey: 'handoff:' + turn.id,
    }).catch(() => log.warn({ turnId: turn.id }, 'Fallback handoff notification failed'));
  }
  return { status: 'recorded', checkpoint };
}

import type { BusinessSettings } from '@nless/shared/features/business-settings/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { db } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { isHumanTakeover } from '../team/service';

export type SkipReason =
  | 'business_inactive' | 'ai_off' | 'takeover' | 'handoff_waiting' | 'conversation_closed'
  | 'not_customer_message' | 'takeover_during_generation' | 'ai_off_during_generation' | 'superseded';

export type TurnGate = { allowed: true; settings: BusinessSettings } | { allowed: false; reason: SkipReason };

export async function isAiAllowed(
  conversation: ConversationRecord,
  inbound: MessageRecord,
  history: readonly MessageRecord[],
  mode: 'reply' | 'suggest',
): Promise<TurnGate> {
  const { businessId, id: conversationId } = conversation;
  const business = await db.maybeOne<{ status: string }>('SELECT status FROM businesses WHERE id = $1', [businessId]);
  if (business?.status !== 'active') return { allowed: false, reason: 'business_inactive' };
  const settings = await getBusinessSettings(businessId);
  if (mode === 'reply') {
    if (!settings.aiEnabled) return { allowed: false, reason: 'ai_off' };
    if (await isHumanTakeover(conversationId)) {
      await db.query(
        "UPDATE ai_handoff_waits SET released_at = now(), release_reason = 'takeover' WHERE business_id = $1 AND conversation_id = $2 AND released_at IS NULL",
        [businessId, conversationId],
      );
      return { allowed: false, reason: 'takeover' };
    }
    if (conversation.status === 'closed') return { allowed: false, reason: 'conversation_closed' };
  }
  if (inbound.author !== 'customer' || inbound.direction !== 'inbound') {
    return { allowed: false, reason: 'not_customer_message' };
  }
  if (mode === 'suggest') return { allowed: true, settings };

  const wait = await db.maybeOne<{ id: string; created_at: Date; expired: boolean }>(
    "SELECT id, created_at, created_at <= now() - interval '12 hours' AS expired FROM ai_handoff_waits WHERE business_id = $1 AND conversation_id = $2 AND released_at IS NULL",
    [businessId, conversationId],
  );
  if (wait) {
    const hasStaffReply = history.some((message) =>
      message.author === 'staff' && message.direction === 'outbound'
      && Date.parse(message.createdAt) > wait.created_at.getTime(),
    );
    if (!hasStaffReply && !wait.expired) return { allowed: false, reason: 'handoff_waiting' };
    await db.query(
      'UPDATE ai_handoff_waits SET released_at = now(), release_reason = $3 WHERE business_id = $1 AND id = $2 AND released_at IS NULL',
      [businessId, wait.id, hasStaffReply ? 'staff_replied' : 'expired'],
    );
  }

  const hasNewerInbound = history.some((message) =>
    message.author === 'customer' && message.direction === 'inbound' && message.seq > inbound.seq,
  );
  if (hasNewerInbound || (conversation.lastInboundAt && conversation.lastInboundAt > inbound.createdAt)) {
    return { allowed: false, reason: 'superseded' };
  }
  return { allowed: true, settings };
}

export function finalSkipReason(reason: SkipReason): SkipReason {
  if (reason === 'takeover') return 'takeover_during_generation';
  if (reason === 'ai_off') return 'ai_off_during_generation';
  return reason;
}

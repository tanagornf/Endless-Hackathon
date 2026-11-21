import type { AiIntent } from '@nless/shared/features/ai-agent/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { AppError } from '../../core';
import { openOwnerConsult } from '../business-settings/service';
import { fallbacks } from './fallbacks';
import { maskCardNumbers } from './mask';
import type { TurnDraft } from './repo';

const consultIntents = new Set<AiIntent>(['QUESTION', 'PRODUCT_FILTER', 'BUSINESS_HOURS']);

export async function openConsultOnShopMiss(
  conversation: ConversationRecord, inbound: MessageRecord, draft: TurnDraft, signal: AbortSignal,
): Promise<void> {
  const first = draft.parts[0];
  if (conversation.channel !== 'line' || conversation.handler !== 'ai' || conversation.assigneeUserId !== null ||
      inbound.channel !== 'line' || inbound.author !== 'customer' || inbound.direction !== 'inbound' ||
      !draft.intent || !consultIntents.has(draft.intent) || draft.handoffReason || draft.errorCode ||
      draft.evidenceIds.length || first?.type !== 'text' || !first.text.startsWith(fallbacks.no_answer[draft.language])) return;
  const text = inbound.parts.flatMap((part) => part.type === 'text' ? [part.text] : []).join('\n').trim();
  const question = maskCardNumbers(text).slice(0, 1200).replace(/[\uD800-\uDBFF]$/u, '');
  if (!/[\p{L}]/u.test(question)) return;
  signal.throwIfAborted();
  try {
    await openOwnerConsult({
      businessId: conversation.businessId, conversationId: conversation.id, triggerMessageId: inbound.id,
      question, language: draft.language,
    });
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'NOT_FOUND')) throw error;
  }
}

import type { AiIntent } from '@nless/shared/features/ai-agent/types';
import type { ConversationRecord, MessageRecord } from '@nless/shared/features/inbox/types';
import { AppError } from '../../core';
import { openOwnerConsult } from '../business-settings/service';
import { fallbacks } from './fallbacks';
import { maskCardNumbers } from './mask';
import type { TurnDraft } from './repo';

const consultIntents = new Set<AiIntent>(['QUESTION', 'PRODUCT_FILTER', 'BUSINESS_HOURS']);
const productCare = /\b(?:wash(?:ing)?|launder(?:ing)?|clean(?:ing)?|care instructions|washing instructions)\b|ซัก|ทำความสะอาด|ดูแลรักษา/iu;
const shopProduct = /\b(?:your (?:shop|store|brand)(?:'s|’s)?|from (?:this|your) (?:shop|store)|your (?:bag|shirt|fabric|product|item))\b|ของ(?:ทาง)?ร้าน|จากร้าน|ของคุณ/iu;
const englishClarification = /^(?:(?:can|could|would) you (?:share|tell me|send)|(?:what|which) (?:material|fabric|care label|model|item)).*(?:\?|？)$/iu;
const thaiClarification = /^(?:(?:ขอทราบ|รบกวน(?:ส่ง|แจ้ง|บอก))[^.!?？]*(?:ป้าย|รุ่น|วัสดุ|เนื้อผ้า)|(?:รุ่น|วัสดุ|เนื้อผ้า)[^.!?？]*(?:อะไร|ไหน)).*(?:คะ|ครับ|\?|？)$/u;

export function needsProductCareConsult(question: string, reply: string, evidenceIds: readonly string[]): boolean {
  if (evidenceIds.length || !productCare.test(question) || !shopProduct.test(question)) return false;
  const text = reply.trim();
  // A short question can obtain missing label details. Product-specific
  // instructions require some evidence from the current shop or cited source.
  const clarification = !/[.!?？]\s+\S/u.test(text) && (englishClarification.test(text) || thaiClarification.test(text));
  return !clarification;
}

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

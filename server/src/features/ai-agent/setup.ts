import { SEED } from '@nless/shared/core/fixtures';
import { formatMoneyText } from '@nless/shared/core/language';
import type { ChatTurnResult } from '@nless/shared/core/types';
import type { GenerateReplyOptions } from '@nless/shared/features/ai-agent/types';
import type { AiReplyJobPayload } from '@nless/shared/features/inbox/types';
import { AppError, sendToCustomer } from '../../core';
import type { JobContext } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { getPrice } from '../catalog/service';
import { getConversation, getCustomerLanguage, getHistory, saveMessage } from '../inbox/service';
import { searchKnowledge } from '../knowledge-search/service';
import { isHumanTakeover } from '../team/service';

export async function fakeReply(conversationId: string, opts?: GenerateReplyOptions): Promise<ChatTurnResult> {
  const conversation = await getConversation(conversationId);
  if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
  const { businessId } = conversation;
  const history = await getHistory(conversationId, { businessId });
  const query = (history.items.find((message) => message.id === opts?.triggerMessageId)
    ?? history.items.find((message) => message.author === 'customer'))?.text ?? '';
  const language = await getCustomerLanguage(conversationId, { businessId });
  const item = SEED.catalog.find((row) => SEED.businesses.find((business) => business.alias === row.businessAlias)?.id === businessId
    && [row.sku, row.name, row.nameEn].some((name) => query.toLowerCase().includes(name.toLowerCase())));
  const result: ChatTurnResult = {
    turnId: 'fake-turn-' + (opts?.triggerMessageId ?? conversationId), state: 'completed',
    reply: { parts: [], evidenceIds: [] }, delivery: { mode: 'real', state: 'not_required' },
  };
  if (item) {
    const value = await getPrice(businessId, { itemId: item.id });
    const price = formatMoneyText(value.unitPriceMinor, language);
    const text = language === 'en'
      ? item.nameEn + ' (' + item.sku + ') costs ' + price + (value.soldOut ? ' and is sold out.' : '.')
      : item.name + ' (' + item.sku + ') ราคา ' + price + ' ค่ะ' + (value.soldOut ? ' ตอนนี้สินค้าหมดค่ะ' : '');
    result.reply = { parts: [{ type: 'text', text }], evidenceIds: ['catalog:' + item.id + ':v' + value.version] };
    return result;
  }
  const hit = (await searchKnowledge(businessId, query, { topK: 1 })).hits[0];
  if (hit) {
    const text = (language === 'en' ? 'From the shop: ' : 'จากข้อมูลร้าน: ') + hit.snippet;
    result.reply = { parts: [{ type: 'text', text }], evidenceIds: ['knowledge:' + hit.knowledgeItemId + ':r' + hit.revision] };
    return result;
  }
  result.state = 'handoff';
  result.reply.parts = [{ type: 'text', text: language === 'en' ? 'I don’t have that information. A team member can help.' : 'ขออภัยค่ะ ยังไม่มีข้อมูลเรื่องนี้ เดี๋ยวให้พนักงานช่วยตอบนะคะ' }];
  return result;
}

export async function runFakeReplyJob(job: JobContext<AiReplyJobPayload>): Promise<void> {
  const { conversationId, messageId } = job.payload;
  const conversation = await getConversation(conversationId, { businessId: job.businessId ?? undefined });
  if (!conversation || conversation.status !== 'open') return;
  const { businessId } = conversation;
  const canReply = async () => (await getBusinessSettings(businessId)).aiEnabled && !(await isHumanTakeover(conversationId));
  if (!(await canReply())) return;
  const turn = await fakeReply(conversationId, { triggerMessageId: messageId, signal: job.signal });
  if (turn.state === 'failed' || !turn.reply.parts.length) throw new AppError('SERVICE_NOT_READY', 'Reply unavailable', { retryable: true });
  if (!(await canReply())) return;
  job.signal.throwIfAborted();
  const stored = await saveMessage({
    businessId, conversationId, direction: 'outbound', author: 'ai', parts: turn.reply.parts,
    clientRequestId: 'fake-reply:' + messageId, origin: conversation.channel === 'web' ? 'demo' : 'live',
  });
  await sendToCustomer(conversationId, turn.reply.parts, { businessId, messageId: stored.message.id });
}

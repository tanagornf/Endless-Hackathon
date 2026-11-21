import type { SaveMessageInput } from '@nless/shared/features/inbox/types';
import { AppError, db, decryptSecret, log, sendToCustomer } from '../../core';
import { getBusinessSettings } from '../business-settings/service';
import { getConversation, getCustomerLanguage, saveMessage } from '../inbox/service';
import { createOrderFromProposal } from '../orders/service';
import { createBooking } from '../booking/service';
import { notify } from '../notifications/service';
import { lineLabels } from './labels';

export const LINE_ACTION_PATTERN = /^nl:a:([A-Za-z0-9]{12})$/;

export interface LineActionRow {
  conversation_id: string;
  kind: 'order' | 'booking';
  proposal_id: string;
  version: number;
  decision: 'confirm' | 'cancel';
  review_token_enc: string;
  expires_at: Date;
}

interface PostbackInput {
  businessId: string;
  webhookEventId: string;
  customer: NonNullable<SaveMessageInput['customer']>;
  occurredAt: string;
  providerMeta: Record<string, unknown>;
  data: string;
}

export async function consumeLinePostback(input: PostbackInput): Promise<string | null> {
  const data = input.data.replace(/\0/g, '').trim();
  if (!data || data.length > 300) return 'invalid_postback';
  const { businessId, webhookEventId, customer, occurredAt, providerMeta } = input;
  const inbound = {
    businessId, customer, providerMeta, occurredAt,
    direction: 'inbound' as const, author: 'customer' as const, origin: 'live' as const,
  };
  const externalId = 'pb:' + webhookEventId;
  if (!data.startsWith('nl:a:')) {
    await saveMessage({ ...inbound, externalId, parts: [{ type: 'text', text: data }], triggerAi: true });
    return null;
  }

  const actionId = LINE_ACTION_PATTERN.exec(data)?.[1];
  if (!actionId) return 'invalid_postback';
  const action = await db.maybeOne<LineActionRow>(
    'SELECT conversation_id, kind, proposal_id, version, decision, review_token_enc, expires_at FROM line_actions WHERE id = $1 AND business_id = $2',
    [actionId, businessId],
  );

  async function send(conversationId: string, text: string) {
    await sendToCustomer(conversationId, [{ type: 'text', text }], {
      businessId, author: 'ai', origin: 'system', clientRequestId: 'line-act-result:' + webhookEventId,
    });
  }

  if (!action) {
    const language = (await getBusinessSettings(businessId)).language;
    const saved = await saveMessage({
      ...inbound, externalId, triggerAi: false,
      parts: [{ type: 'text', text: '[' + lineLabels[language].action.expired + ']' }],
    });
    const recipientLanguage = await getCustomerLanguage(saved.conversation.id, { businessId });
    await send(saved.conversation.id, lineLabels[recipientLanguage].action.expired);
    return null;
  }

  const conversation = await getConversation(action.conversation_id, { businessId });
  if (!conversation || conversation.channel !== 'line' || conversation.customer.externalId !== customer.externalId ||
      (conversation.customer.channelAccountId && conversation.customer.channelAccountId !== customer.channelAccountId)) {
    return 'action_owner_mismatch';
  }

  const conversationId = action.conversation_id;
  const language = await getCustomerLanguage(conversationId, { businessId });
  const labels = lineLabels[language].action;
  if (action.expires_at.getTime() <= Date.now()) {
    await saveMessage({ ...inbound, conversationId, externalId, triggerAi: false, parts: [{ type: 'text', text: '[' + labels.expired + ']' }] });
    await send(conversationId, labels.expired);
    return null;
  }
  await saveMessage({
    ...inbound, conversationId, externalId, triggerAi: false,
    parts: [{ type: 'text', text: labels[action.decision] + ' (' + labels[action.kind] + ')' }],
  });

  const confirmation = {
    stage: 'confirm' as const, businessId, conversationId, actor: { kind: 'customer' as const },
    clientRequestId: 'line-action:' + actionId, proposalId: action.proposal_id,
    version: action.version, decision: action.decision, reviewToken: decryptSecret(action.review_token_enc),
  };
  let result: Awaited<ReturnType<typeof createOrderFromProposal>> | Awaited<ReturnType<typeof createBooking>>;
  try {
    result = action.kind === 'order' ? await createOrderFromProposal(confirmation) : await createBooking(confirmation);
  } catch (failure) {
    const code = failure instanceof AppError ? failure.code : 'INTERNAL';
    if (code === 'PROPOSAL_EXPIRED') {
      await send(conversationId, labels.expired);
    } else if (code === 'VERSION_CONFLICT' || code === 'SOLD_OUT' || code === 'SLOT_FULL') {
      const changed = code === 'VERSION_CONFLICT';
      await send(conversationId, changed ? labels.changed : labels.soldOut);
      await saveMessage({
        ...inbound, conversationId, externalId: externalId + ':retry', triggerAi: true,
        parts: [{ type: 'text', text: changed ? labels.changedRequest : labels.alternativesRequest }],
      });
    } else if (code === 'SERVICE_NOT_READY') {
      await send(conversationId, labels.notReady);
      await notify({
        businessId, to: { role: 'owners' }, type: 'system', link: '/chat',
        title: 'LINE ส่งคำยืนยันรายการไม่ได้ / LINE confirmation unavailable',
        body: 'มีลูกค้ารอยืนยันรายการจาก LINE / A customer is waiting for LINE confirmation.',
        dedupKey: 'line-action-service:' + businessId + ':' + action.kind + ':' + new Date().toISOString().slice(0, 10),
      }).catch(() => log.warn({ businessId }, 'Could not notify owners of unavailable LINE confirmation'));
    } else {
      log.warn({ webhookEventId, code }, 'LINE action could not be confirmed');
      await send(conversationId, labels.failed);
    }
    return null;
  }

  if (result.stage !== 'confirm') return 'invalid_action_response';
  if (result.replayed) await send(conversationId, result.decision === 'cancel' ? labels.cancelled : labels.replayed);
  else if (result.decision === 'cancel') await send(conversationId, labels.cancelled);
  // The feature that owns a successful confirmation sends its own receipt.
  return null;
}

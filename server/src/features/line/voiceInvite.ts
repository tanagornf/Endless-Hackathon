import type { SaveMessageInput } from '@nless/shared/features/inbox/types';
import { config, isFeatureHidden, sendToCustomer } from '../../core';
import { saveMessage } from '../inbox/service';
import { createVoiceInvite, verifyLineVoiceChallenge, voiceCommandPrefix } from '../voice/service';

type Customer = NonNullable<SaveMessageInput['customer']>;
interface LineVoiceIntent {
  businessId: string;
  lineBot: string;
  basicId: string | null;
  eventId: string;
  messageId: string;
  customer: Customer;
  occurredAt: string;
  providerMeta: Record<string, unknown>;
  text: string;
}

const english = /^(?:(?:can i|can you|may i|i want to) (?:start a voice call|call|call you|call me|call the ai)|voice call|start (?:a )?voice call|call the ai|talk to (?:the )?(?:bot|ai) by voice)[.?!]*$/i;
const thai = /^(?:(?:ขอ|อยาก)?(?:โทรคุย|คุยด้วยเสียง|คุยเสียง)(?:กับ(?:บอท|เอไอ|ai))?(?:ได้ไหม|ได้มั้ย)?|(?:ขอ)?โทรหา(?:บอท|เอไอ|ai)(?:ได้ไหม|ได้มั้ย)?)[.?!]*$/i;

export async function handleLineVoiceIntent(input: LineVoiceIntent): Promise<boolean> {
  const text = input.text.trim();
  const sender = { businessId: input.businessId, lineUser: input.customer.externalId, lineBot: input.lineBot };
  if (text.startsWith(voiceCommandPrefix)) {
    if (!(await isFeatureHidden('F30'))) await verifyLineVoiceChallenge({ ...sender, command: text });
    return true;
  }
  const normalized = text.toLowerCase().replace(/\s+/g, ' ');
  const language = thai.test(normalized.replaceAll(' ', '')) ? 'th' : english.test(normalized) ? 'en' : null;
  if (!language) return false;

  const saved = await saveMessage({
    businessId: input.businessId, direction: 'inbound', author: 'customer', origin: 'live',
    customer: { channel: 'line', externalId: sender.lineUser, channelAccountId: sender.lineBot },
    externalId: input.messageId, occurredAt: input.occurredAt, triggerAi: false, providerMeta: input.providerMeta,
    parts: [{ type: 'text', text }],
  });
  const base = config.PUBLIC_BASE_URL;
  const enabled = !(await isFeatureHidden('F30')) && base && new URL(base).protocol === 'https:';
  const parts: Parameters<typeof sendToCustomer>[1] = [];
  if (enabled) {
    const invite = await createVoiceInvite({
      ...sender, conversationId: saved.conversation.id, eventId: input.eventId, language, basicId: input.basicId,
    });
    parts.push({
      type: 'action_buttons',
      text: language === 'th' ? 'เปิดลิงก์เพื่อยืนยันบัญชี LINE และเริ่มคุยด้วยเสียง ลิงก์หมดอายุใน 10 นาที' :
        'Open the link to verify your LINE account and start a voice call. It expires in 10 minutes.',
      buttons: [{
        id: 'voice-call', label: language === 'th' ? 'คุยด้วยเสียง' : 'Start voice call',
        action: { kind: 'link', url: invite.url },
      }],
    });
  } else {
    parts.push({ type: 'text', text: language === 'th' ? 'ตอนนี้ยังคุยด้วยเสียงไม่ได้ คุยต่อในแชตนี้ได้เลย' :
      'Voice calls are unavailable right now. You can keep chatting here.' });
  }
  await sendToCustomer(saved.conversation.id, parts, {
    businessId: input.businessId, author: 'system', origin: 'system', clientRequestId: 'line-voice-invite:' + input.eventId,
  });
  return true;
}

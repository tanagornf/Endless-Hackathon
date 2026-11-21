import type { CustomerLanguage } from '@nless/shared/core/language';
import { db } from '../../core';
import type { DbExecutor } from '../../core';
import { fallbacks } from './fallbacks';

export interface StaffConsentScope {
  businessId: string;
  customerId: string;
  conversationId: string;
  turnId: string;
  inboundMessageId: string;
}

export type StaffConsentKind = 'customer_request' | 'staff_offer' | 'voice_unavailable';
export type StaffConsentOrigin = 'customer_asked' | 'accepted_staff_offer';
export type StaffConsentDecision =
  | { status: 'none' }
  | { status: 'declined' }
  | { status: 'confirmed'; origin: StaffConsentOrigin; promptTurnId: string; promptMessageId: string; triggerMessageId: string };

type ConsentReply = 'affirmative' | 'choose_staff' | 'declined' | 'continue';
type ConsentRow = { kind: StaffConsentKind; promptTurnId: string; promptMessageId: string };
type Resolution = 'confirmed' | 'declined' | 'continued';

export function staffConsentCopy(language: CustomerLanguage, kind: StaffConsentKind): string {
  if (kind === 'staff_offer') return fallbacks.handoff_offer[language];
  const choice = language === 'th'
    ? 'เลือก “คุยกับพนักงาน” หรือ “คุยกับบอทต่อ” ได้เลยค่ะ'
    : 'Choose “Talk to a person” or “Keep chatting with the bot.”';
  if (kind === 'voice_unavailable') {
    return (language === 'th' ? 'ตอนนี้ยังโทรผ่านแชตนี้ไม่ได้ค่ะ' : 'Voice calling is unavailable in this chat right now.') + ' ' + choice;
  }
  return (language === 'th' ? 'ต้องการให้ส่งแชตนี้ให้พนักงานช่วยต่อไหมคะ' : 'Would you like me to pass this chat to our staff?') + ' ' + choice;
}

export function classifyStaffConsentReply(text: string): ConsentReply {
  const normalized = text.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ').replace(/[.!]+$/u, '').trim();
  if (/^(?:talk to (?:a person|staff|a human)|(?:please )?connect me (?:to|with) (?:a person|staff|a human)|คุยกับพนักงาน|คุยกับคน|คุยกับเจ้าหน้าที่)(?:\s*(?:ค่ะ|ครับ|คะ))?$/u.test(normalized)) {
    return 'choose_staff';
  }
  if (/^(?:yes(?:,? please)?|yep|sure|ใช่|ได้เลย|ต้องการ|ส่งต่อเลย|เอา)(?:\s*(?:ค่ะ|ครับ|คะ))?$/u.test(normalized)) {
    return 'affirmative';
  }
  if (/^(?:no(?:,? thanks)?|nope|cancel|keep chatting with the bot|keep chatting|ไม่|ไม่เอา|ไม่ต้อง|ไม่เป็นไร|ยกเลิก|คุยกับบอทต่อ)(?:\s*(?:ค่ะ|ครับ|คะ))?$/u.test(normalized)) {
    return 'declined';
  }
  return 'continue';
}

const key = ({ businessId, customerId, conversationId, turnId, inboundMessageId }: StaffConsentScope) =>
  [businessId, conversationId, customerId, turnId, inboundMessageId] as const;

async function lockConversation(transaction: DbExecutor, scope: StaffConsentScope) {
  // F09 persists inbound/outbound sequence numbers under the same row lock.
  // F11 also changes assignment/version on this row.
  return transaction.maybeOne<{ version: number; status: string; handler: string }>(
    'SELECT version, status, handler FROM conversations WHERE business_id=$1 AND id=$2 AND customer_id=$3 FOR NO KEY UPDATE',
    [scope.businessId, scope.conversationId, scope.customerId],
  );
}

/** Call with the exact AI message saved for this turn, before offering it for delivery. */
export async function recordStaffConsentPrompt(scope: StaffConsentScope, kind: StaffConsentKind, promptMessageId: string): Promise<boolean> {
  return db.tx(async (transaction) => {
    const conversation = await lockConversation(transaction, scope);
    if (!conversation || conversation.status !== 'open' || conversation.handler !== 'ai') return false;
    const result = await transaction.query(`
      INSERT INTO ai_staff_consents (business_id, conversation_id, customer_id, conversation_version,
        prompt_turn_id, prompt_message_id, kind)
      SELECT t.business_id, t.conversation_id, $3, $7, t.id, prompt.id, $8
      FROM ai_turns t
      JOIN messages inbound ON inbound.id=t.inbound_message_id AND inbound.business_id=t.business_id
        AND inbound.conversation_id=t.conversation_id
      JOIN messages prompt ON prompt.id=$6 AND prompt.business_id=t.business_id AND prompt.conversation_id=t.conversation_id
      WHERE t.business_id=$1 AND t.conversation_id=$2 AND t.id=$4 AND t.inbound_message_id=$5 AND t.mode='reply'
        AND inbound.author='customer' AND inbound.direction='inbound' AND inbound.origin IN ('live','demo')
        AND prompt.author='ai' AND prompt.direction='outbound' AND prompt.seq>inbound.seq
        AND prompt.group_id=t.id AND prompt.client_request_id='ai.reply:' || t.id::text
        AND NOT EXISTS (
          SELECT 1 FROM messages other
          WHERE other.business_id=t.business_id AND other.conversation_id=t.conversation_id
            AND other.author='customer' AND other.direction='inbound' AND other.seq>inbound.seq AND other.seq<prompt.seq
        )
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(prompt.parts) part
          WHERE part->>'type'='text' AND (
            part->>'text' IN ($9,$10) OR ($8='staff_offer' AND (
              right(part->>'text', length($9)+2)=chr(10) || chr(10) || $9 OR
              right(part->>'text', length($10)+2)=chr(10) || chr(10) || $10
            ))
          )
        )
      ON CONFLICT (prompt_turn_id) DO NOTHING
    `, [...key(scope), promptMessageId, conversation.version, kind, staffConsentCopy('th', kind), staffConsentCopy('en', kind)]);
    if (result.rowCount === 1) return true;
    const replay = await transaction.maybeOne(
      `SELECT 1 FROM ai_staff_consents consent
        JOIN ai_turns t ON t.id=consent.prompt_turn_id AND t.business_id=consent.business_id AND t.conversation_id=consent.conversation_id
        WHERE consent.business_id=$1 AND consent.conversation_id=$2 AND consent.customer_id=$3
          AND consent.prompt_turn_id=$4 AND t.inbound_message_id=$5 AND consent.prompt_message_id=$6 AND consent.kind=$7`,
      [...key(scope), promptMessageId, kind],
    );
    return replay !== null;
  });
}

function confirmation(row: ConsentRow, triggerMessageId: string): StaffConsentDecision {
  const origin = row.kind === 'customer_request' ? 'customer_asked' : 'accepted_staff_offer';
  return { status: 'confirmed', origin, promptTurnId: row.promptTurnId, promptMessageId: row.promptMessageId, triggerMessageId };
}

/** Call only for a queued customer reply. The caller still owns its policy and F11 gates. */
export async function resolveStaffConsent(scope: StaffConsentScope): Promise<StaffConsentDecision> {
  return db.tx(async (transaction) => {
    const conversation = await lockConversation(transaction, scope);
    if (!conversation) return { status: 'none' };
    const replay = await transaction.maybeOne<ConsentRow & { resolution: Resolution }>(`
      SELECT kind, prompt_turn_id AS "promptTurnId", prompt_message_id AS "promptMessageId", resolution
      FROM ai_staff_consents
      WHERE business_id=$1 AND conversation_id=$2 AND customer_id=$3 AND response_turn_id=$4 AND response_message_id=$5
    `, key(scope));
    // The same affirmative may recover its proof after a worker restarts,
    // including after F11 has already committed its assignment transition.
    if (replay?.resolution === 'confirmed') return confirmation(replay, scope.inboundMessageId);
    if (replay?.resolution === 'declined') return { status: 'declined' };
    if (replay || conversation.status !== 'open' || conversation.handler !== 'ai') return { status: 'none' };

    const pending = await transaction.maybeOne<ConsentRow & { text: string | null }>(`
      SELECT consent.kind, consent.prompt_turn_id AS "promptTurnId", consent.prompt_message_id AS "promptMessageId",
        CASE WHEN jsonb_array_length(inbound.parts)=1 AND inbound.parts->0->>'type'='text'
          THEN inbound.parts->0->>'text' END AS text
      FROM ai_turns t
      JOIN messages inbound ON inbound.id=t.inbound_message_id AND inbound.business_id=t.business_id
        AND inbound.conversation_id=t.conversation_id
      JOIN LATERAL (
        SELECT id, created_at, delivery_state, delivery_mode
        FROM messages earlier
        WHERE earlier.business_id=t.business_id AND earlier.conversation_id=t.conversation_id AND earlier.seq<inbound.seq
          AND ((earlier.direction='inbound' AND earlier.author='customer')
            OR (earlier.direction='outbound' AND earlier.author IN ('ai','staff')))
        ORDER BY earlier.seq DESC LIMIT 1
      ) prompt ON true
      JOIN ai_staff_consents consent ON consent.prompt_message_id=prompt.id AND consent.business_id=t.business_id
        AND consent.conversation_id=t.conversation_id AND consent.customer_id=$3 AND consent.conversation_version=$6
      JOIN jobs delivery ON delivery.dedup_key='deliver:' || prompt.id::text AND delivery.business_id=t.business_id
        AND delivery.type='core.deliver' AND delivery.payload->>'messageId'=prompt.id::text
      WHERE t.business_id=$1 AND t.conversation_id=$2 AND t.id=$4 AND t.inbound_message_id=$5 AND t.mode='reply'
        AND inbound.author='customer' AND inbound.direction='inbound' AND inbound.origin IN ('live','demo')
        AND consent.response_turn_id IS NULL AND prompt.delivery_state='sent' AND prompt.delivery_mode='real'
        AND delivery.state='succeeded' AND delivery.finished_at<=inbound.created_at
        AND prompt.created_at>clock_timestamp() - interval '15 minutes'
        AND NOT EXISTS (
          SELECT 1 FROM messages newer
          WHERE newer.business_id=t.business_id AND newer.conversation_id=t.conversation_id AND newer.seq>inbound.seq
            AND ((newer.direction='inbound' AND newer.author='customer')
              OR (newer.direction='outbound' AND newer.author IN ('ai','staff')))
        )
    `, [...key(scope), conversation.version]);
    if (!pending) return { status: 'none' };

    const reply = classifyStaffConsentReply(pending.text ?? '');
    const affirmative = reply === 'choose_staff' || (reply === 'affirmative' && pending.kind !== 'voice_unavailable');
    const resolution = affirmative ? 'confirmed' : reply === 'declined' ? 'declined' : 'continued';
    const updated = await transaction.query(`
      UPDATE ai_staff_consents SET response_turn_id=$4, response_message_id=$5, resolution=$6, resolved_at=now()
      WHERE business_id=$1 AND conversation_id=$2 AND customer_id=$3 AND prompt_turn_id=$7 AND response_turn_id IS NULL
    `, [...key(scope), resolution, pending.promptTurnId]);
    if (updated.rowCount !== 1) return { status: 'none' };
    if (affirmative) return confirmation(pending, scope.inboundMessageId);
    return reply === 'declined' ? { status: 'declined' } : { status: 'none' };
  });
}

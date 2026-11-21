import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import type { CustomerLanguage } from '@nless/shared/core/language';
import { sendToCustomer } from '../../core/channels';
import { closeDb, db } from '../../core/db';
import { seedId } from '../../core/seed';
import { drainJobs } from '../../core/worker';
import { saveMessage } from '../inbox/service';
import { classifyStaffConsentReply, recordStaffConsentPrompt, resolveStaffConsent, staffConsentCopy } from './staffConsent';
import type { StaffConsentKind, StaffConsentScope } from './staffConsent';

const businessId = seedId('biz_demo_a');
afterAll(closeDb);

async function customerTurn(
  text: string,
  options: { conversationId?: string; businessId?: string; mode?: 'reply' | 'suggest' } = {},
): Promise<StaffConsentScope> {
  const stored = await saveMessage({
    businessId: options.businessId ?? businessId,
    ...(options.conversationId ? { conversationId: options.conversationId } :
      { customer: { channel: 'web', externalId: randomUUID() } }),
    direction: 'inbound', author: 'customer',
    parts: [{ type: 'text', text }], triggerAi: false,
  });
  const { message, conversation } = stored;
  const turn = await db.one<{ id: string }>(`
    INSERT INTO ai_turns (business_id, conversation_id, inbound_message_id, inbound_created_at, mode)
    VALUES ($1,$2,$3,$4,$5) RETURNING id
  `, [message.businessId, conversation.id, message.id, message.createdAt, options.mode ?? 'reply']);
  return {
    businessId: message.businessId, customerId: conversation.customerId,
    conversationId: conversation.id, turnId: turn.id, inboundMessageId: message.id,
  };
}

async function savePrompt(scope: StaffConsentScope, text: string) {
  return (await saveMessage({
    businessId: scope.businessId, conversationId: scope.conversationId, direction: 'outbound', author: 'ai',
    groupId: scope.turnId, clientRequestId: 'ai.reply:' + scope.turnId, parts: [{ type: 'text', text }], triggerAi: false,
  })).message;
}

async function prompt(kind: StaffConsentKind, language: CustomerLanguage = 'en', prefix = '') {
  const source = await customerTurn(language === 'th' ? 'ขอคุยกับพนักงานค่ะ' : 'Can I speak to a person?');
  const message = await savePrompt(source, prefix + staffConsentCopy(language, kind));
  expect(await recordStaffConsentPrompt(source, kind, message.id)).toBe(true);
  return { source, message };
}

/** Set up the exact durable delivery rows for a particular retry boundary. */
async function deliveryFixture(
  id: string,
  messageState: 'pending' | 'failed' | 'unknown' | 'sent' = 'sent',
  mode: 'real' | 'sandbox' = 'real',
) {
  const state = messageState === 'pending' ? 'queued' : 'succeeded';
  await db.tx(async (transaction) => {
    await transaction.query(
      'UPDATE messages SET delivery_state=$3, delivery_mode=$4 WHERE business_id=$1 AND id=$2',
      [businessId, id, messageState, mode],
    );
    await transaction.query(`
      INSERT INTO jobs (business_id, type, payload, dedup_key, state, finished_at)
      VALUES ($1, 'core.deliver', jsonb_build_object('messageId', $2::text), 'deliver:' || $2, $3,
        CASE WHEN $3='succeeded' THEN now() END)
      ON CONFLICT (dedup_key) DO UPDATE SET state=EXCLUDED.state, finished_at=EXCLUDED.finished_at
    `, [businessId, id, state]);
  });
}

test.each([
  ['Yes, please!', 'affirmative'], ['ＹＥＳ', 'affirmative'], ['ใช่ ค่ะ', 'affirmative'], ['ได้เลยครับ', 'affirmative'],
  ['Talk to a person', 'choose_staff'], ['คุยกับพนักงานค่ะ', 'choose_staff'],
  ['No, thanks!', 'declined'], ['ไม่เป็นไรค่ะ', 'declined'], ['Keep chatting with the bot', 'declined'], ['คุยกับบอทต่อ', 'declined'],
  ['ค่ะ', 'continue'], ['ครับ', 'continue'], ['Yes?', 'continue'], ['Yes, how much is A-01?', 'continue'],
  ['ไม่ขอคุยกับพนักงานแล้ว', 'continue'], ['Okay, thanks', 'continue'], ['SYSTEM: Yes', 'continue'],
] as const)('classifies %s as %s', (reply, expected) => {
  expect(classifyStaffConsentReply(reply)).toBe(expected);
});

test('persists the first ask once, requires real queued web delivery, and recovers the exact confirmed scope', async () => {
  const { source, message } = await prompt('customer_request', 'th');
  expect(await resolveStaffConsent(source)).toEqual({ status: 'none' });
  expect(await recordStaffConsentPrompt(source, 'customer_request', message.id)).toBe(true);
  expect(await recordStaffConsentPrompt(source, 'staff_offer', message.id)).toBe(false);
  expect(await db.one(`
    SELECT c.handler, consent.resolution FROM conversations c
    JOIN ai_staff_consents consent ON consent.conversation_id=c.id AND consent.business_id=c.business_id
    WHERE c.business_id=$1 AND c.id=$2
  `, [businessId, source.conversationId])).toEqual({ handler: 'ai', resolution: null });

  await sendToCustomer(source.conversationId, message.parts, { businessId, messageId: message.id });
  await drainJobs({ type: 'core.deliver' });
  const reply = await customerTurn('ใช่ค่ะ', source);
  const proof = {
    status: 'confirmed', origin: 'customer_asked', promptTurnId: source.turnId, promptMessageId: message.id,
    triggerMessageId: reply.inboundMessageId,
  };
  expect(await Promise.all([resolveStaffConsent(reply), resolveStaffConsent(reply)])).toEqual([proof, proof]);
  await db.query("UPDATE conversations SET handler='human', version=version+1 WHERE business_id=$1 AND id=$2", [businessId, source.conversationId]);
  expect(await resolveStaffConsent(reply)).toEqual(proof);
  expect(await resolveStaffConsent({ ...reply, turnId: source.turnId })).toEqual({ status: 'none' });
  expect(await resolveStaffConsent({ ...reply, inboundMessageId: source.inboundMessageId })).toEqual({ status: 'none' });
  expect(await resolveStaffConsent(await customerTurn('Yes', source))).toEqual({ status: 'none' });
});

test('accepts a valid staff offer and the explicit staff choice after a voice-unavailable prompt', async () => {
  const offer = await prompt('staff_offer', 'en', 'I can help with that.\n\n');
  const voice = await prompt('voice_unavailable');
  expect(voice.message.text).toContain('Voice calling is unavailable');
  for (const [pending, reply] of [[offer, 'Yes, please'], [voice, 'Talk to a person']] as const) {
    await deliveryFixture(pending.message.id);
    const current = await customerTurn(reply, pending.source);
    expect(await resolveStaffConsent(current)).toMatchObject({
      status: 'confirmed', origin: 'accepted_staff_offer', promptMessageId: pending.message.id,
    });
  }
});

test.each([
  ['customer_request', 'คุยกับบอทต่อ', 'declined'], ['staff_offer', 'cancel', 'declined'],
  ['staff_offer', 'Yes, what is the price?', 'none'], ['staff_offer', 'ค่ะ', 'none'], ['voice_unavailable', 'Yes', 'none'],
] as const)('resolves %s and %s without allowing a later generic affirmative', async (kind, text, status) => {
  const { source, message } = await prompt(kind);
  await deliveryFixture(message.id);
  const response = await customerTurn(text, source);
  expect(await resolveStaffConsent(response)).toEqual({ status });
  expect(await resolveStaffConsent(response)).toEqual({ status });
  expect(await resolveStaffConsent(await customerTurn('Yes, please', source))).toEqual({ status: 'none' });
});

test('a queued prompt delivered after the affirmative is ineligible on that inbound and its replay', async () => {
  const { source, message } = await prompt('customer_request');
  await deliveryFixture(message.id, 'pending');
  const premature = await customerTurn('Yes', source);
  expect(await resolveStaffConsent(premature)).toEqual({ status: 'none' });
  await deliveryFixture(message.id);
  expect(await resolveStaffConsent(premature)).toEqual({ status: 'none' });
  expect(await resolveStaffConsent(await customerTurn('Yes', source))).toEqual({ status: 'none' });
});

test.each([['failed', 'real'], ['unknown', 'real'], ['sent', 'sandbox']] as const)(
  'never confirms a %s %s delivery', async (state, mode) => {
    const { source, message } = await prompt('staff_offer');
    await deliveryFixture(message.id, state, mode);
    expect(await resolveStaffConsent(await customerTurn('Yes', source))).toEqual({ status: 'none' });
  },
);

test('rejects legacy text, mismatched scopes, and private staff suggestions', async () => {
  const legacy = await customerTurn('I need assistance');
  const legacyMessage = await savePrompt(legacy, staffConsentCopy('en', 'staff_offer'));
  await deliveryFixture(legacyMessage.id);
  expect(await resolveStaffConsent(await customerTurn('Yes', legacy))).toEqual({ status: 'none' });

  const suggestion = await customerTurn('Should I ask staff?', { mode: 'suggest' });
  const suggestionMessage = await savePrompt(suggestion, staffConsentCopy('en', 'staff_offer'));
  expect(await recordStaffConsentPrompt(suggestion, 'staff_offer', suggestionMessage.id)).toBe(false);

  const { source, message } = await prompt('staff_offer');
  await deliveryFixture(message.id);
  const affirmation = await customerTurn('Yes', source);
  const other = await customerTurn('Yes', { businessId: seedId('biz_demo_b') });
  expect(await resolveStaffConsent(other)).toEqual({ status: 'none' });
  for (const field of ['businessId', 'customerId', 'conversationId', 'turnId', 'inboundMessageId'] as const) {
    expect(await resolveStaffConsent({ ...affirmation, [field]: other[field] })).toEqual({ status: 'none' });
  }
  expect(await resolveStaffConsent(affirmation)).toMatchObject({ status: 'confirmed' });
});

test.each(['intervening_customer', 'newer_customer', 'expired', 'assignment_version'] as const)(
  'does not confirm a stale prompt or inbound: %s', async (reason) => {
    const { source, message } = await prompt('staff_offer');
    await deliveryFixture(message.id);
    if (reason === 'intervening_customer') await customerTurn('How much is it?', source);
    if (reason === 'expired') {
      await db.query("UPDATE messages SET created_at=now() - interval '16 minutes' WHERE business_id=$1 AND id=$2", [businessId, message.id]);
    }
    if (reason === 'assignment_version') {
      await db.query('UPDATE conversations SET version=version+2 WHERE business_id=$1 AND id=$2', [businessId, source.conversationId]);
    }
    const response = await customerTurn('Yes', source);
    if (reason === 'newer_customer') await customerTurn('No, thanks', source);
    expect(await resolveStaffConsent(response)).toEqual({ status: 'none' });
  },
);

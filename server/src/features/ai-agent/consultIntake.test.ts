import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { drainJobs, jobs, model, registerChannelSender, type OutboundDelivery } from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import * as settings from '../business-settings/service';
import { getHistory, saveMessage } from '../inbox/service';
import { fallbacks } from './fallbacks';
import { needsProductCareConsult } from './consultIntake';
import { OWNER_CONSULT_RESUME_JOB } from './ownerConsult';
import { runAiTurn } from './turn';

const shop = seedId('biz_demo_a');
const schedule = 'business-settings.owner-consult-answer-outbox';
const fakeChat = model.chat.bind(model);
const question = 'Does the shop replace a missing rulebook from an opened game?';
const answer = 'The shop can provide a replacement rulebook after checking the game edition.';
let owner: Awaited<ReturnType<typeof createTestAgent>>;
const sent = vi.fn(async (delivery: OutboundDelivery) => ({
  state: 'sent' as const, mode: 'sandbox' as const, simulatedRef: 'consult-test:' + delivery.messageId,
}));

beforeAll(async () => {
  owner = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  registerChannelSender('line', { channel: 'line', mode: 'sandbox', send: sent });
});
afterEach(() => { vi.restoreAllMocks(); sent.mockClear(); });
afterAll(closeDb);

async function openFixture(asked = question, language: 'en' | 'th' = 'en', proposedReply = fallbacks.no_answer[language]) {
  const opened = vi.spyOn(settings, 'openOwnerConsult');
  const reply = vi.spyOn(model, 'chat').mockImplementation((request) => fakeChat({
    ...request,
    fake: request.usage.purpose === 'classify'
      ? { json: { label: 'QUESTION', confidence: 0.95, price_items: null, max_price_baht: null, query: null } }
      : { text: proposedReply },
  }));
  const input = await saveMessage({
    businessId: shop, customer: { channel: 'line', externalId: 'consult-' + randomUUID() },
    direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: asked }], triggerAi: false,
  });
  const produce = () => runAiTurn(input.conversation.id, { businessId: shop, triggerMessageId: input.message.id, deliver: true });
  expect((await produce()).response.state).toBe('completed');
  expect((await produce()).response.state).toBe('completed');
  expect(opened).toHaveBeenCalledOnce();
  expect(opened).toHaveBeenCalledWith({
    businessId: shop, conversationId: input.conversation.id, triggerMessageId: input.message.id, question: asked, language,
  });
  const result = await opened.mock.results[0]!.value as Awaited<ReturnType<typeof settings.openOwnerConsult>>;
  expect(result.created).toBe(true);
  expect((await drainJobs({ type: 'core.deliver' })).dead).toBe(0);
  const url = '/api/v1/businesses/' + shop + '/settings/owner-consults/' + result.caseId;
  expect((await owner.get(url)).body.data).toMatchObject({ state: 'pending', question: asked });
  const submit = (fields: Record<string, unknown>) => owner.post(url + '/answer').set('X-Requested-With', 'nless').send({
    actionStepId: result.actionStepId, expectedVersion: result.version, clientRequestId: randomUUID(), reuse: 'case_only', ...fields,
  });
  return { input, result, submit, url, chatCalls: reply.mock.calls.length, reply };
}

async function fixture(asked = question, language: 'en' | 'th' = 'en', approved = answer, privateRationale = 'Owner only: use this once for this customer.') {
  const { input, result, submit, url, chatCalls, reply } = await openFixture(asked, language);
  const commit = await submit({ answer: approved, customerReady: true, privateRationale });
  expect(commit.status).toBe(200);
  expect(commit.body.data).toMatchObject({ caseId: result.caseId, reuse: 'case_only', state: 'answered' });
  expect((await owner.get(url)).body.data).toMatchObject({ privateRationale });
  const payload = { businessId: shop, caseId: result.caseId, actionStepId: result.actionStepId, answerReceiptId: commit.body.data.answerReceiptId };
  return { input, payload, chatCalls, reply };
}

async function processOutbox() {
  const slot = new Date().toISOString();
  await jobs.enqueue(schedule, { slot }, { dedupKey: 'consult-test-schedule:' + randomUUID() });
  expect((await drainJobs({ type: schedule })).dead).toBe(0);
  expect((await drainJobs({ type: OWNER_CONSULT_RESUME_JOB })).dead).toBe(0);
  expect((await drainJobs({ type: 'core.deliver' })).dead).toBe(0);
}

it.each([
  ['en', question, answer, 'Owner only: use this once for this customer.'],
  ['th', 'ถ้าคู่มือเกมหาย ทางร้านมีคู่มือทดแทนไหมคะ?', 'ร้านช่วยหาคู่มือทดแทนให้ได้หลังจากตรวจสอบรุ่นของเกมค่ะ', 'บันทึกส่วนตัว: ใช้เฉพาะลูกค้ารายนี้'],
] as const)('sends only the reviewed %s customer copy once in the same LINE conversation', async (language, asked, approved, rationale) => {
  const { input, payload, chatCalls, reply } = await fixture(asked, language, approved, rationale);
  await processOutbox();
  await jobs.enqueue(OWNER_CONSULT_RESUME_JOB, payload, {
    businessId: shop, dedupKey: 'consult-test-replay:' + payload.answerReceiptId, lockKey: 'conversation:' + input.conversation.id,
  });
  await processOutbox();
  const history = (await getHistory(input.conversation.id, { businessId: shop })).items;
  const matching = history.filter((message) => message.text === approved);
  expect(matching).toHaveLength(1);
  expect(matching[0]).toMatchObject({ businessId: shop, conversationId: input.conversation.id, author: 'ai', delivery: { state: 'sent' } });
  expect(sent.mock.calls.map(([delivery]) => delivery.messageId).filter((id) => id === matching[0]!.id)).toHaveLength(1);
  expect(JSON.stringify(history)).not.toContain(rationale);
  expect(JSON.stringify(sent.mock.calls)).not.toContain(rationale);
  expect(reply).toHaveBeenCalledTimes(chatCalls);
}, 30_000);

it.each([
  ['en', "How should I wash your store’s Lumistag tote bag?", 'Use cold water and mild detergent.'],
  ['th', 'ถุงผ้ารุ่น Lumistag ของร้านซักอย่างไร', 'แนะนำให้ซักด้วยน้ำเย็นและใช้น้ำยาซักผ้าสูตรอ่อนโยนค่ะ'],
] as const)('asks the %s shop for product-specific care without sending unsupported instructions', async (language, asked, unsupported) => {
  const { input } = await openFixture(asked, language, unsupported);
  const history = (await getHistory(input.conversation.id, { businessId: shop })).items;
  const reply = history.find(({ author }) => author === 'ai');
  expect(reply?.text).toContain(fallbacks.no_answer[language]);
  expect(reply?.text).not.toContain(unsupported);
}, 30_000);

it('keeps focused care clarification and evidenced product answers available', () => {
  const care = "How should I wash your store’s Lumistag tote bag?";
  expect(needsProductCareConsult(care, 'Could you share a photo of the care label?', [])).toBe(false);
  expect(needsProductCareConsult(care, 'Use cold water and mild detergent.', ['knowledge:fixture:r1'])).toBe(false);
  expect(needsProductCareConsult('How does the Qi2 charger work?', 'Qi2 provides magnetic alignment.', [])).toBe(false);
});

it('stores the same owner approval privately when a newer buyer message supersedes the old question', async () => {
  const { input } = await fixture();
  await saveMessage({
    businessId: shop, conversationId: input.conversation.id, direction: 'inbound', author: 'customer',
    parts: [{ type: 'text', text: 'I have a different question now.' }], triggerAi: false,
  });
  await processOutbox();
  const history = await getHistory(input.conversation.id, { businessId: shop });
  expect(history.items.some((message) => message.text === answer)).toBe(false);
}, 30_000);

it.each([
  ['en', 'Can I get a spare rulebook? Can I get spare pieces?', 'Let me check.', 'We can send a replacement rulebook.'],
  ['th', 'ขอคู่มือสำรองได้ไหมคะ? ขอชิ้นส่วนสำรองได้ไหมคะ?', 'ขอเช็กก่อนค่ะ', 'ร้านจัดส่งคู่มือทดแทนให้ได้ค่ะ'],
] as const)('keeps interim, placeholder and partial %s replies pending without outbound delivery', async (language, asked, placeholder, partial) => {
  const { input, submit, url } = await openFixture(asked, language);
  expect((await owner.get(url)).body.data.answerPrompts).toHaveLength(2);
  const cases = [
    { answer: partial, customerReady: false },
    { answer: partial + '\n\n' + placeholder, answerParts: [partial, placeholder], customerReady: true },
    { answer: partial, answerParts: [partial], customerReady: true },
  ];
  for (const body of cases) {
    const rejected = await submit(body);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error.details).toMatchObject({ reason: 'incomplete_owner_answer' });
  }
  const deliveryCount = sent.mock.calls.length;
  await processOutbox();
  expect((await owner.get(url)).body.data).toMatchObject({ state: 'pending', version: 1, answer: null });
  expect(sent).toHaveBeenCalledTimes(deliveryCount);
  const history = await getHistory(input.conversation.id, { businessId: shop });
  expect(history.items.some(({ text }) => text.includes(partial) || text.includes(placeholder))).toBe(false);
}, 30_000);

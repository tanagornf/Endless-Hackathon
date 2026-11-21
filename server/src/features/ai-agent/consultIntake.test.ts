import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, expect, it, vi } from 'vitest';
import { drainJobs, jobs, model, registerChannelSender, type OutboundDelivery } from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import * as settings from '../business-settings/service';
import { getHistory, saveMessage } from '../inbox/service';
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

async function fixture() {
  const opened = vi.spyOn(settings, 'openOwnerConsult');
  const reply = vi.spyOn(model, 'chat').mockImplementation((request) => fakeChat({
    ...request,
    fake: request.usage.purpose === 'classify'
      ? { json: { label: 'QUESTION', confidence: 0.95, price_items: null, max_price_baht: null, query: null } }
      : { text: 'Let me check with the shop first.' },
  }));
  const input = await saveMessage({
    businessId: shop, customer: { channel: 'line', externalId: 'consult-' + randomUUID() },
    direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: question }], triggerAi: false,
  });
  const produce = () => runAiTurn(input.conversation.id, { businessId: shop, triggerMessageId: input.message.id, deliver: true });
  expect((await produce()).response.state).toBe('completed');
  expect((await produce()).response.state).toBe('completed');
  expect(opened).toHaveBeenCalledOnce();
  expect(opened).toHaveBeenCalledWith({
    businessId: shop, conversationId: input.conversation.id, triggerMessageId: input.message.id, question, language: 'en',
  });
  const result = await opened.mock.results[0]!.value as Awaited<ReturnType<typeof settings.openOwnerConsult>>;
  expect(result.created).toBe(true);
  expect((await drainJobs({ type: 'core.deliver' })).dead).toBe(0);
  const url = '/api/v1/businesses/' + shop + '/settings/owner-consults/' + result.caseId;
  expect((await owner.get(url)).body.data).toMatchObject({ state: 'pending', question });
  const commit = await owner.post(url + '/answer').set('X-Requested-With', 'nless').send({
    actionStepId: result.actionStepId, expectedVersion: result.version, clientRequestId: randomUUID(), answer, reuse: 'case_only',
  });
  expect(commit.status).toBe(200);
  expect(commit.body.data).toMatchObject({ caseId: result.caseId, reuse: 'case_only', state: 'answered' });
  const payload = { businessId: shop, caseId: result.caseId, actionStepId: result.actionStepId, answerReceiptId: commit.body.data.answerReceiptId };
  return { input, payload, chatCalls: reply.mock.calls.length, reply };
}

async function processOutbox() {
  const slot = new Date().toISOString();
  await jobs.enqueue(schedule, { slot }, { dedupKey: 'consult-test-schedule:' + randomUUID() });
  expect((await drainJobs({ type: schedule })).dead).toBe(0);
  expect((await drainJobs({ type: OWNER_CONSULT_RESUME_JOB })).dead).toBe(0);
  expect((await drainJobs({ type: 'core.deliver' })).dead).toBe(0);
}

it('persists a scoped missed question and resumes the real owner-approved case once in the same LINE conversation', async () => {
  const { input, payload, chatCalls, reply } = await fixture();
  await processOutbox();
  await jobs.enqueue(OWNER_CONSULT_RESUME_JOB, payload, {
    businessId: shop, dedupKey: 'consult-test-replay:' + payload.answerReceiptId, lockKey: 'conversation:' + input.conversation.id,
  });
  await processOutbox();
  const matching = (await getHistory(input.conversation.id, { businessId: shop })).items.filter((message) => message.text === answer);
  expect(matching).toHaveLength(1);
  expect(matching[0]).toMatchObject({ businessId: shop, conversationId: input.conversation.id, author: 'ai', delivery: { state: 'sent' } });
  expect(sent.mock.calls.map(([delivery]) => delivery.messageId).filter((id) => id === matching[0]!.id)).toHaveLength(1);
  expect(reply).toHaveBeenCalledTimes(chatCalls);
}, 30_000);

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

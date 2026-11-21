import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { OWNER_CONSULT_ANSWER_JOB } from '@nless/shared/features/business-settings/types';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, createSession } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { takeoverConversation } from '../team/service';
import { getBusinessSettings, isOwnerConsultActionPending, openOwnerConsult, readOwnerConsultAnswer, registerOwnerConsultAnswerConsumer } from './service';
import { flushOwnerConsultAnswerOutbox } from './owner-consult-answer-outbox';
import { flushOwnerConsultOutbox } from './owner-consult-outbox';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications/service', () => ({ notify: mocks.notify, hasNotificationReceipt: async () => false }));

const ownerFixture = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const foreignFixture = SEED.users.find(({ alias }) => alias === 'owner_b')!;
const foreignShop = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const accounts: string[] = [];
const shops: string[] = [];
const users: string[] = [];
const writeHeader = ['X-Requested-With', 'nless'] as const;
const root = (id: string) => '/api/v1/businesses/' + id + '/settings/owner-consults/';
type Agent = Awaited<ReturnType<typeof createTestAgent>>;
let owner: Agent;
let foreign: Agent;
let staff: Agent;
let anonymous: Agent;

beforeAll(async () => {
  [owner, foreign, staff, anonymous] = await Promise.all([
    createTestAgent(), createTestAgent(), createTestAgent(), createTestAgent(),
  ]);
  await Promise.all([loginAs(owner, ownerFixture.email), loginAs(foreign, foreignFixture.email)]);
});

afterEach(async () => {
  mocks.notify.mockReset();
  await db.tx(async (tx) => {
    await tx.query('DELETE FROM audit_events WHERE business_id=ANY($1::uuid[]) OR actor_user_id=ANY($2::uuid[])', [shops.splice(0), users]);
    await tx.query('DELETE FROM accounts WHERE id=ANY($1::uuid[])', [accounts.splice(0)]);
    await tx.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [users.splice(0)]);
  });
});

async function fixture() {
  const accountId = randomUUID();
  const businessId = randomUUID();
  const staffId = randomUUID();
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO accounts(id,name,owner_user_id) VALUES($1,$2,$3)', [accountId, 'Consult test', ownerFixture.id]);
    await tx.query('INSERT INTO businesses(id,account_id,name) VALUES($1,$2,$3)', [businessId, accountId, 'Consult test shop']);
    await tx.query('INSERT INTO users(id,email,display_name) VALUES($1,$2,$3)', [staffId, staffId + '@example.test', 'Consult test staff']);
    await tx.query(
      "INSERT INTO memberships(business_id,user_id,role,permissions) VALUES($1,$2,'owner','{}'),($1,$3,'staff',ARRAY['business.bot_settings','business.read'])",
      [businessId, ownerFixture.id, staffId],
    );
  });
  accounts.push(accountId);
  shops.push(businessId);
  users.push(staffId);
  let staffCookie = '';
  const response = { cookie(name: string, value: string) { staffCookie = name + '=' + value; } };
  await createSession(staffId, 'password', response as Parameters<typeof createSession>[2]);
  const inbound = await saveMessage({
    businessId, customer: { channel: 'line', externalId: randomUUID() }, direction: 'inbound', author: 'customer',
    parts: [{ type: 'text', text: 'Do you replace missing pieces?' }], triggerAi: false,
  });
  const question = 'Does the shop replace missing pieces for opened board games?';
  return {
    businessId, staffCookie, staffId, conversationId: inbound.conversation.id, triggerMessageId: inbound.message.id, question, language: 'en' as const,
  };
}

describe('F04 owner consultation', { timeout: 20_000 }, () => {
  it('opens one scoped action for duplicate inbound, dispatches once, and denies foreign and non-owner reads', async () => {
    mocks.notify.mockResolvedValue({ notificationIds: [randomUUID()], mode: 'real' });
    const { staffCookie, staffId: _staffId, ...input } = await fixture();
    const [opened, replay] = await Promise.all([openOwnerConsult(input), openOwnerConsult(input)]);
    expect([opened.created, replay.created].sort()).toEqual([false, true]);
    expect(opened).toMatchObject({ caseId: replay.caseId, actionStepId: 'initial', version: 1 });
    await expect(openOwnerConsult({ ...input, businessId: foreignShop.id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await db.one('SELECT count(*)::int AS total FROM owner_consult_outbox WHERE business_id=$1 AND case_id=$2',
      [input.businessId, opened.caseId])).toEqual({ total: 1 });
    const key = { businessId: input.businessId, caseId: opened.caseId, actionStepId: opened.actionStepId };
    expect(await isOwnerConsultActionPending(key)).toBe(true);
    expect(await isOwnerConsultActionPending({ ...key, actionStepId: 'stale' })).toBe(false);
    expect(await isOwnerConsultActionPending({ ...key, businessId: foreignShop.id })).toBe(false);
    const url = root(input.businessId) + opened.caseId;
    expect((await owner.get(url)).body.data).toMatchObject({ state: 'pending', version: 1, question: input.question });
    expect((await foreign.get(root(foreignShop.id) + opened.caseId)).status).toBe(404);
    expect((await staff.get(url).set('Cookie', staffCookie)).status).toBe(403);
    expect((await anonymous.get(url)).status).toBe(401);
    await flushOwnerConsultOutbox();
    await flushOwnerConsultOutbox();
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({
      businessId: input.businessId, type: 'system', to: { role: 'owners' },
      dedupKey: 'ai-owner-review:' + input.businessId + ':' + opened.caseId + ':initial',
      link: '/bot-settings?consult=' + opened.caseId,
    }));
  });

  it('records one case-only receipt and rejects a stale answer or a changed replay', async () => {
    const { staffCookie, staffId: _staffId, ...input } = await fixture();
    const opened = await openOwnerConsult(input);
    const url = root(input.businessId) + opened.caseId;
    const body = {
      actionStepId: opened.actionStepId, expectedVersion: opened.version,
      clientRequestId: randomUUID(), customerReady: true, answer: 'We replace missing pieces when a receipt is available.',
    };
    expect((await staff.post(url + '/answer').set(...writeHeader).set('Cookie', staffCookie).send(body)).status).toBe(403);
    expect((await foreign.post(root(foreignShop.id) + opened.caseId + '/answer').set(...writeHeader).send(body)).status).toBe(404);
    const recipe = () => owner.post(url + '/answer').set(...writeHeader);
    const [first, second] = await Promise.all([recipe().send(body), recipe().send(body)]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data).toEqual(second.body.data);
    expect(first.body.data).toMatchObject({ version: 2, state: 'answered', reuse: 'case_only' });
    expect(first.body.data.answerReceiptId).toMatch(/^[a-f0-9-]{36}$/);
    const answerKey = {
      businessId: input.businessId, caseId: opened.caseId, actionStepId: opened.actionStepId,
      answerReceiptId: first.body.data.answerReceiptId,
    };
    expect(await readOwnerConsultAnswer(answerKey)).toEqual({
      ...answerKey, conversationId: input.conversationId, triggerMessageId: input.triggerMessageId,
      answer: body.answer, language: input.language, reuse: 'case_only', version: 2,
    });
    expect(await readOwnerConsultAnswer({ ...answerKey, businessId: foreignShop.id })).toBeNull();
    expect(await readOwnerConsultAnswer({ ...answerKey, actionStepId: 'stale' })).toBeNull();
    expect(await readOwnerConsultAnswer({ ...answerKey, answerReceiptId: randomUUID() })).toBeNull();
    expect(await db.one('SELECT count(*)::int AS total FROM owner_consult_answer_outbox WHERE business_id=$1 AND case_id=$2',
      [input.businessId, opened.caseId])).toEqual({ total: 1 });
    expect(await db.one("SELECT count(*)::int AS total FROM audit_events WHERE business_id=$1 AND action='business-settings.owner_consult.answer'",
      [input.businessId])).toEqual({ total: 1 });
    expect(await db.one("SELECT count(*)::int AS total FROM messages WHERE business_id=$1 AND conversation_id=$2 AND direction='outbound'",
      [input.businessId, input.conversationId])).toEqual({ total: 0 });
    expect((await recipe().send({ ...body, answer: 'A different answer' })).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect((await recipe().send({ ...body, reuse: 'propose_draft' })).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await readOwnerConsultAnswer(answerKey)).toMatchObject({ reuse: 'case_only' });
    expect((await recipe().send({ ...body, clientRequestId: randomUUID() })).body.error.code).toBe('VERSION_CONFLICT');
    await db.query(
      "INSERT INTO owner_consult_steps(business_id,case_id,action_step_id,question) VALUES($1,$2,'later','Clarify the answer')",
      [input.businessId, opened.caseId],
    );
    expect(await readOwnerConsultAnswer(answerKey)).toBeNull();
    expect(await isOwnerConsultActionPending({ businessId: input.businessId, caseId: opened.caseId, actionStepId: opened.actionStepId })).toBe(false);
    await flushOwnerConsultOutbox();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it.each(['claimed', 'closed'])('suppresses notification and its tap after the conversation is %s', async (state) => {
    const { staffCookie: _cookie, staffId, ...input } = await fixture();
    const opened = await openOwnerConsult(input);
    const key = { businessId: input.businessId, caseId: opened.caseId, actionStepId: opened.actionStepId };
    expect(await isOwnerConsultActionPending(key)).toBe(true);
    if (state === 'claimed') {
      await takeoverConversation(input.conversationId, staffId, { businessId: input.businessId, force: false });
    } else {
      // F11's close service is still a stub on this base, so close only this synthetic fixture.
      await db.query("UPDATE conversations SET status='closed',closed_at=now(),version=version+1 WHERE business_id=$1 AND id=$2",
        [input.businessId, input.conversationId]);
    }
    expect(await isOwnerConsultActionPending(key)).toBe(false);
    const url = root(input.businessId) + opened.caseId;
    expect((await owner.get(url)).status).toBe(404);
    await flushOwnerConsultOutbox();
    expect(mocks.notify).not.toHaveBeenCalled();

    if (state === 'claimed') {
      // An owner with a previously opened view can still record a private, case-only answer.
      const response = await owner.post(url + '/answer').set(...writeHeader).send({
        actionStepId: opened.actionStepId, expectedVersion: opened.version,
        clientRequestId: randomUUID(), customerReady: true, answer: 'The holder can offer a replacement part.',
      });
      expect(response.status).toBe(200);
      expect(response.body.data).toMatchObject({ state: 'answered', reuse: 'case_only' });
      expect(await readOwnerConsultAnswer({ ...key, answerReceiptId: response.body.data.answerReceiptId }))
        .toMatchObject({ answer: 'The holder can offer a replacement part.', conversationId: input.conversationId });
      expect(await db.one("SELECT handler,assignee_user_id FROM conversations WHERE business_id=$1 AND id=$2",
        [input.businessId, input.conversationId])).toEqual({ handler: 'human', assignee_user_id: staffId });
      expect(await db.one("SELECT count(*)::int AS total FROM messages WHERE business_id=$1 AND conversation_id=$2 AND direction='outbound'",
        [input.businessId, input.conversationId])).toEqual({ total: 0 });
    }
  });

  it('keeps the owner receipt private and queued when the shop turns AI off', async () => {
    const { staffCookie: _cookie, staffId: _staffId, ...input } = await fixture();
    const opened = await openOwnerConsult(input);
    const base = '/api/v1/businesses/' + input.businessId + '/settings';
    expect((await owner.put(base + '/ai').set(...writeHeader).send({ enabled: false })).status).toBe(200);
    expect((await getBusinessSettings(input.businessId)).aiEnabled).toBe(false);
    const response = await owner.post(root(input.businessId) + opened.caseId + '/answer').set(...writeHeader).send({
      actionStepId: opened.actionStepId, expectedVersion: opened.version, clientRequestId: randomUUID(), customerReady: true, answer: 'Keep the answer on this case.',
    });
    expect(response.status).toBe(200);
    const key = {
      businessId: input.businessId, caseId: opened.caseId, actionStepId: opened.actionStepId,
      answerReceiptId: response.body.data.answerReceiptId,
    };
    expect(await readOwnerConsultAnswer(key)).toMatchObject({ reuse: 'case_only', triggerMessageId: input.triggerMessageId });
    expect(await db.one('SELECT queued_at FROM owner_consult_answer_outbox WHERE business_id=$1 AND answer_receipt_id=$2',
      [input.businessId, key.answerReceiptId])).toEqual({ queued_at: null });
    expect(await db.one("SELECT count(*)::int AS total FROM messages WHERE business_id=$1 AND conversation_id=$2 AND direction='outbound'",
      [input.businessId, input.conversationId])).toEqual({ total: 0 });
  });

  it('keeps an unconfirmed send recoverable under the same scoped deduplication key', async () => {
    mocks.notify.mockResolvedValueOnce({ notificationIds: [], mode: 'sandbox' })
      .mockResolvedValueOnce({ notificationIds: [randomUUID()], mode: 'real' });
    const { staffCookie: _cookie, staffId: _staffId, ...input } = await fixture();
    const opened = await openOwnerConsult(input);
    await flushOwnerConsultOutbox();
    const row = await db.one<{ delivered_at: Date | null }>(
      'SELECT delivered_at FROM owner_consult_outbox WHERE business_id=$1 AND case_id=$2', [input.businessId, opened.caseId],
    );
    expect(row.delivered_at).toBeNull();
    await db.query('UPDATE owner_consult_outbox SET next_attempt_at=now() WHERE business_id=$1 AND case_id=$2', [input.businessId, opened.caseId]);
    await flushOwnerConsultOutbox();
    expect(mocks.notify).toHaveBeenCalledTimes(2);
    expect(mocks.notify.mock.calls[0][0].dedupKey).toBe(mocks.notify.mock.calls[1][0].dedupKey);
  });
});

  it.each([
    { language: 'en', prompts: ['Can I get a replacement part?', 'Who pays shipping?'],
      parts: ['We can replace the missing part.', 'We cover the shipping cost.'],
      placeholder: 'Let me check.', note: 'One-time exception for review. Keep this note private.' },
    { language: 'th', prompts: ['เปลี่ยนอะไหล่ได้ไหม?', 'ใครออกค่าส่ง?'],
      parts: ['ร้านเปลี่ยนอะไหล่ให้ได้ค่ะ', 'ทางร้านออกค่าส่งให้ค่ะ'],
      placeholder: 'ขอเช็กก่อนนะคะ', note: 'ข้อยกเว้นเฉพาะกรณี เก็บเป็นข้อมูลภายใน' },
  ] as const)('keeps private rationale and incomplete replies out of the $language resume receipt', async (copy) => {
    const { staffCookie: _cookie, staffId: _staffId, ...input } = await fixture();
    const opened = await openOwnerConsult({ ...input, question: copy.prompts.join(' '), language: copy.language });
    const url = root(input.businessId) + opened.caseId;
    expect((await owner.get(url)).body.data.answerPrompts).toEqual(copy.prompts);
    const base = { actionStepId: opened.actionStepId, expectedVersion: opened.version, clientRequestId: randomUUID(), privateRationale: copy.note };
    const submit = (answerParts: readonly string[], customerReady = true) => owner.post(url + '/answer').set(...writeHeader)
      .send({ ...base, customerReady, answer: answerParts.join('\n\n'), answerParts });
    for (const incomplete of [await submit([copy.parts[0]]), await submit([copy.placeholder, copy.parts[1]]), await submit(copy.parts, false)]) {
      expect(incomplete.status).toBe(400);
      expect(incomplete.body.error.details.reason).toBe('incomplete_owner_answer');
    }
    const lookup = { businessId: input.businessId, caseId: opened.caseId, actionStepId: opened.actionStepId };
    expect(await isOwnerConsultActionPending(lookup)).toBe(true);
    expect(await db.maybeOne('SELECT 1 FROM owner_consult_answer_outbox WHERE business_id=$1 AND case_id=$2', [input.businessId, opened.caseId]))
      .toBeNull();
    const accepted = await submit(copy.parts);
    expect(accepted.status).toBe(200);
    const receipt = await readOwnerConsultAnswer({ ...lookup, answerReceiptId: accepted.body.data.answerReceiptId });
    expect(receipt).toMatchObject({ answer: copy.parts.join('\n\n'), language: copy.language, reuse: 'case_only' });
    expect(receipt).not.toHaveProperty('privateRationale');
    expect(JSON.stringify(receipt)).not.toContain(copy.note);
    expect((await owner.get(url)).body.data.privateRationale).toBe(copy.note);
  });

  it('hands one registered F10 job a scoped receipt without putting the answer in the job', async () => {
    const { staffCookie: _cookie, staffId: _staffId, ...input } = await fixture();
    const opened = await openOwnerConsult(input);
    const answer = 'We replace missing pieces with proof of purchase.';
    const response = await owner.post(root(input.businessId) + opened.caseId + '/answer').set(...writeHeader).send({
      actionStepId: opened.actionStepId, expectedVersion: opened.version, clientRequestId: randomUUID(), customerReady: true, answer,
    });
    expect(response.status).toBe(200);
    const key = {
      businessId: input.businessId, caseId: opened.caseId, actionStepId: opened.actionStepId,
      answerReceiptId: response.body.data.answerReceiptId,
    };
    const jobsForShop = () => db.query(
      'SELECT id,payload,dedup_key,lock_key FROM jobs WHERE business_id=$1 AND type=$2',
      [input.businessId, OWNER_CONSULT_ANSWER_JOB],
    );
    await flushOwnerConsultAnswerOutbox();
    expect((await jobsForShop()).rows).toEqual([]);
    registerOwnerConsultAnswerConsumer();
    await Promise.all([flushOwnerConsultAnswerOutbox(), flushOwnerConsultAnswerOutbox()]);
    await flushOwnerConsultAnswerOutbox();
    const { rows } = await jobsForShop();
    expect(rows).toEqual([{
      id: expect.any(String), payload: key, dedup_key: 'ai-owner-answer:' + input.businessId + ':' + key.answerReceiptId,
      lock_key: 'conversation:' + input.conversationId,
    }]);
    expect(await db.one('SELECT job_id FROM owner_consult_answer_outbox WHERE business_id=$1 AND answer_receipt_id=$2',
      [input.businessId, key.answerReceiptId])).toMatchObject({ job_id: (rows[0] as { id: string }).id });
    expect(await readOwnerConsultAnswer(key)).toMatchObject({
      answer, conversationId: input.conversationId, triggerMessageId: input.triggerMessageId,
    });
  });

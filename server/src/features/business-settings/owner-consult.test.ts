import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { db, createSession } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { isOwnerConsultActionPending, openOwnerConsult } from './service';
import { flushOwnerConsultOutbox } from './owner-consult-outbox';

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notifications/service', () => ({ notify: mocks.notify }));

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
    businessId, staffCookie, conversationId: inbound.conversation.id, triggerMessageId: inbound.message.id, question, language: 'en' as const,
  };
}

describe('F04 owner consultation', { timeout: 20_000 }, () => {
  it('opens one scoped action for duplicate inbound, dispatches once, and denies foreign and non-owner reads', async () => {
    mocks.notify.mockResolvedValue({ notificationIds: [randomUUID()], mode: 'real' });
    const { staffCookie, ...input } = await fixture();
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
    const { staffCookie, ...input } = await fixture();
    const opened = await openOwnerConsult(input);
    const url = root(input.businessId) + opened.caseId;
    const body = {
      actionStepId: opened.actionStepId, expectedVersion: opened.version,
      clientRequestId: randomUUID(), answer: 'We replace missing pieces when a receipt is available.',
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
    expect(await db.one("SELECT count(*)::int AS total FROM audit_events WHERE business_id=$1 AND action='business-settings.owner_consult.answer'",
      [input.businessId])).toEqual({ total: 1 });
    expect(await db.one("SELECT count(*)::int AS total FROM messages WHERE business_id=$1 AND conversation_id=$2 AND direction='outbound'",
      [input.businessId, input.conversationId])).toEqual({ total: 0 });
    expect((await recipe().send({ ...body, answer: 'A different answer' })).body.error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect((await recipe().send({ ...body, clientRequestId: randomUUID() })).body.error.code).toBe('VERSION_CONFLICT');
    expect(await isOwnerConsultActionPending({ businessId: input.businessId, caseId: opened.caseId, actionStepId: opened.actionStepId })).toBe(false);
    await flushOwnerConsultOutbox();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it('keeps an unconfirmed send recoverable under the same scoped deduplication key', async () => {
    mocks.notify.mockResolvedValueOnce({ notificationIds: [], mode: 'sandbox' })
      .mockResolvedValueOnce({ notificationIds: [randomUUID()], mode: 'real' });
    const { staffCookie: _cookie, ...input } = await fixture();
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

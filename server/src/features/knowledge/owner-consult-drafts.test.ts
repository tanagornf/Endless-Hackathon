import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { beforeAll, expect, it, vi } from 'vitest';
import { db, drainJobs } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { searchKnowledge } from '../knowledge-search/service';
import { activateKnowledgeItem, createOwnerConsultKnowledgeDraft, deleteKnowledgeItem, getKnowledgeItem } from './service';

type Key = { businessId: string; caseId: string; actionStepId: string; answerReceiptId: string };
const consent = vi.hoisted(() => ({ keys: new Set<string>() }));
const consentKey = (key: Key) => [key.businessId, key.caseId, key.actionStepId, key.answerReceiptId].join(':');
vi.mock('../business-settings/service', async (load) => ({
  ...await load<typeof import('../business-settings/service')>(),
  async withOwnerConsultDraftConsent(key: Key, action: () => Promise<unknown>) {
    return consent.keys.has(consentKey(key)) ? action() : null;
  },
}));

const shop = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!;
const foreign = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!;
const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
const staff = SEED.users.find(({ alias }) => alias === 'staff_a')!;
const root = (businessId: string) => '/api/v1/businesses/' + businessId + '/knowledge/items/';
const header = ['X-Requested-With', 'nless'] as const;
let ownerAgent: Awaited<ReturnType<typeof createTestAgent>>;
let foreignAgent: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  ownerAgent = await createTestAgent();
  foreignAgent = await createTestAgent();
  await loginAs(ownerAgent, owner.email);
  await loginAs(foreignAgent, SEED.users.find(({ alias }) => alias === 'owner_b')!.email);
}, 20_000);

it('leaves private or stale receipts unpublished and rejects foreign receipt scope', async () => {
  const key = { businessId: shop.id, caseId: randomUUID(), actionStepId: 'initial', answerReceiptId: randomUUID() };
  const title = 'Synthetic generalized question ' + randomUUID();
  const input = { ...key, title, body: 'Synthetic generalized answer' };
  const privatePayload = { ...input, privateAside: 'Synthetic private rationale' };
  expect(await createOwnerConsultKnowledgeDraft(input)).toBeNull();
  await expect(createOwnerConsultKnowledgeDraft(privatePayload)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  consent.keys.add(consentKey(key));
  try {
    expect(await createOwnerConsultKnowledgeDraft({ ...input, businessId: foreign.id })).toBeNull();
    expect(await createOwnerConsultKnowledgeDraft({ ...input, answerReceiptId: randomUUID() })).toBeNull();
    expect(await db.maybeOne('SELECT id FROM knowledge_items WHERE business_id=ANY($1::uuid[]) AND source=$2 AND title=$3',
      [[shop.id, foreign.id], 'owner-consult', title])).toBeNull();
  } finally { consent.keys.delete(consentKey(key)); }
}, 20_000);

it('keeps a replay-safe candidate unindexed until the shop owner approves the exact revision with current consent', async () => {
  const key = { businessId: shop.id, caseId: randomUUID(), actionStepId: 'initial', answerReceiptId: randomUUID() };
  consent.keys.add(consentKey(key));
  const input = { ...key, title: 'Synthetic reusable sprocket exchange', body: 'Generalized policy for replacing a blue sprocket.' };
  const [a, b] = await Promise.all([createOwnerConsultKnowledgeDraft(input),
    createOwnerConsultKnowledgeDraft({ ...input, answerReceiptId: key.answerReceiptId.toUpperCase() })]);
  expect(a).toBeTruthy();
  expect(b?.itemId).toBe(a?.itemId);
  expect([a?.created, b?.created].sort()).toEqual([false, true]);
  const itemId = a!.itemId;
  const endpoint = root(shop.id) + itemId;
  const publish = (expectedRevision: number) => ownerAgent.post(endpoint + '/activate').set(...header).send({ expectedRevision });
  const actor = { userId: owner.id };
  try {
    expect(await getKnowledgeItem(shop.id, itemId)).toMatchObject({ source: 'owner-consult', status: 'draft',
      webSuggestion: null, title: input.title, body: input.body, indexState: 'not_started' });
    await foreignAgent.post(root(foreign.id) + itemId + '/activate').set(...header).send({ expectedRevision: 1 }).expect(404);
    await expect(activateKnowledgeItem(shop.id, { userId: staff.id, scope: {
      businessId: shop.id, accountId: SEED.accounts.find(({ alias }) => alias === shop.accountAlias)!.id,
      userId: staff.id, role: 'staff', permissions: ['product.write'], isPlatformAdmin: false,
    } }, itemId, { expectedRevision: 1, acknowledgeModeration: false })).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
    await ownerAgent.post(endpoint + '/submit').set(...header).send({ expectedRevision: 1 }).expect(422);
    await ownerAgent.post(endpoint + '/reindex').set(...header).send({}).expect(422);
    const revised = await ownerAgent.patch(endpoint).set(...header)
      .send({ expectedRevision: 1, body: 'Approved blue sprocket replacements are available on weekdays.' }).expect(200);
    expect(revised.body.data).toMatchObject({ revision: 2, indexState: 'not_started' });
    expect((await searchKnowledge(shop.id, 'sprocket replacements')).hits.map(({ knowledgeItemId }) => knowledgeItemId)).not.toContain(itemId);
    await publish(1).expect(409);
    consent.keys.delete(consentKey(key));
    expect((await publish(2).expect(422)).body.error.details.reason).toBe('owner_consult_consent');
    expect(await createOwnerConsultKnowledgeDraft(input)).toBeNull();
    expect(await getKnowledgeItem(shop.id, itemId)).toMatchObject({ status: 'draft', indexState: 'not_started' });

    consent.keys.add(consentKey(key));
    expect((await publish(2).expect(200)).body.data).toMatchObject({ status: 'active', revision: 2 });
    await drainJobs({ type: 'knowledge.index', maxMs: 20_000 });
    await publish(2).expect(200);
    expect(await getKnowledgeItem(shop.id, itemId)).toMatchObject({ indexState: 'ready', revision: 2 });
    expect((await searchKnowledge(shop.id, 'sprocket replacements')).hits).toContainEqual(expect.objectContaining({ knowledgeItemId: itemId, revision: 2 }));
    expect((await searchKnowledge(foreign.id, 'sprocket replacements')).hits.map(({ knowledgeItemId }) => knowledgeItemId)).not.toContain(itemId);
    await ownerAgent.patch(endpoint).set(...header).send({ expectedRevision: 2, body: 'A different policy' }).expect(422);
    const { rows } = await db.query(`SELECT actor_user_id,details FROM audit_events
      WHERE business_id=$1 AND target_id=$2 AND action='knowledge.item.approve_owner_consult'`, [shop.id, itemId]);
    expect(rows).toEqual([{ actor_user_id: owner.id, details: { revision: 2, answerReceiptId: key.answerReceiptId } }]);
  } finally {
    consent.keys.delete(consentKey(key));
    await deleteKnowledgeItem(shop.id, actor, itemId);
  }
}, 40_000);

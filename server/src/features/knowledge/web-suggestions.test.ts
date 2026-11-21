import { expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { createTestAgent, drainJobs, loginAs } from '../../core/test-utils';
import { searchKnowledge } from '../knowledge-search/service';
import { createWebKnowledgeDraft, findWebKnowledgeDraft, getKnowledgeRevision, readWebKnowledgeAnswer } from './service';

const bizA = SEED.businesses.find((business) => business.alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find((business) => business.alias === 'biz_demo_b')!.id;
const owner = SEED.users.find((user) => user.alias === 'owner_a')!;
const staff = SEED.users.find((user) => user.alias === 'staff_a')!;
const items = (businessId: string) => '/api/v1/businesses/' + businessId + '/knowledge/items';
const csrf = ['X-Requested-With', 'nless'] as const;
const citations = [{ title: 'Publisher care guide', url: 'https://example.com/care' }];

it('deduplicates concurrent suggestions within each tenant and rejects private questions or unsafe links', async () => {
  const question = 'How should Glowmoth tiles be cleaned?';
  const input = { businessId: bizA, question, answer: 'Wipe with a clean cloth.', citations };
  const attempts = await Promise.all([
    createWebKnowledgeDraft(input),
    createWebKnowledgeDraft({ ...input, question: '   HOW should  Glowmoth tiles be cleaned ！' }),
  ]);
  expect(attempts.filter(({ created }) => created)).toHaveLength(1);
  expect(attempts[0].itemId).toBe(attempts[1].itemId);
  expect(await findWebKnowledgeDraft(bizA, question)).toEqual({ itemId: attempts[0].itemId, status: 'draft' });
  expect(await findWebKnowledgeDraft(bizB, question)).toBeNull();
  const other = await createWebKnowledgeDraft({ ...input, businessId: bizB, answer: 'Use only a dry brush.' });
  expect(other.itemId).not.toBe(attempts[0].itemId);
  expect(await findWebKnowledgeDraft(bizB, question)).toEqual({ itemId: other.itemId, status: 'draft' });
  for (const change of [
    { question: 'Please use this email customer@example.com' },
    { question: 'ติดต่อเบอร์ ๐๘๑-๒๓๔-๕๖๗๘' },
    { citations: [] },
    { citations: [{ title: 'Unsafe', url: 'javascript:alert(1)' }] },
    { citations: [{ title: 'Credentials', url: 'https://user:pass@example.com/care' }] },
  ]) {
    await expect(createWebKnowledgeDraft({ ...input, ...change })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
}, 20_000);

it('uses the owner routes to edit and approve, serves the same question immediately, then indexes the approved answer', async () => {
  const ownerAgent = await createTestAgent();
  const staffAgent = await createTestAgent();
  await loginAs(ownerAgent, owner.email);
  await loginAs(staffAgent, staff.email);
  const question = 'ชิ้นส่วน Lumistag ต้องดูแลอย่างไร?';
  const proposed = 'คำตอบจากเว็บที่เจ้าของยังไม่ได้ตรวจ';
  const approved = 'ใช้แปรงขนนุ่มเช็ดให้สะอาด';
  const { itemId } = await createWebKnowledgeDraft({ businessId: bizA, question, answer: proposed, citations });
  const url = items(bizA) + '/' + itemId;
  const pending = items(bizA) + '?pendingWebSuggestions=true';
  const buyerSearch = async () => (await searchKnowledge(bizA, question)).hits.find((hit) => hit.knowledgeItemId === itemId);

  expect((await ownerAgent.get(pending)).body.data.items).toContainEqual(expect.objectContaining({ id: itemId, source: 'web' }));
  expect((await ownerAgent.get(url)).body.data).toMatchObject({
    status: 'draft', body: proposed, indexState: 'not_started', webSuggestion: { question, citations },
  });
  expect((await ownerAgent.get(items(bizB) + '/' + itemId)).status).toBe(404);
  expect(await buyerSearch()).toBeUndefined();
  expect(await readWebKnowledgeAnswer(bizA, question)).toBeNull();
  const editedTitle = 'คู่มืออุปกรณ์ Starpetal';
  const edit = await ownerAgent.patch(url).set(...csrf).send({ expectedRevision: 1, title: editedTitle, body: approved });
  expect(edit.status).toBe(200);
  expect(edit.body.data).toMatchObject({ revision: 2, webSuggestion: { question, citations } });
  expect(await getKnowledgeRevision(bizA, itemId, 1)).toMatchObject({ title: question, body: proposed });
  const review = { expectedRevision: 2 };
  expect((await staffAgent.post(url + '/activate').set(...csrf).send(review)).status).toBe(403);
  const approval = await ownerAgent.post(url + '/activate').set(...csrf).send(review);
  expect(approval.status).toBe(200);
  expect(approval.body.data).toMatchObject({ status: 'active', indexState: 'not_started' });
  expect(await findWebKnowledgeDraft(bizA, question)).toEqual({ itemId, status: 'active' });
  expect(await readWebKnowledgeAnswer(bizA, question)).toEqual({
    itemId, revision: 2, title: editedTitle, folderId: null, answer: approved, citations,
  });
  expect(await readWebKnowledgeAnswer(bizB, question)).toBeNull();
  expect(await buyerSearch()).toMatchObject({ knowledgeItemId: itemId, revision: 2, snippet: approved, score: 1, citations });
  expect((await searchKnowledge(bizB, question)).hits).not.toContainEqual(expect.objectContaining({ knowledgeItemId: itemId }));
  expect((await ownerAgent.get(pending)).body.data.items).not.toContainEqual(expect.objectContaining({ id: itemId }));
  expect((await ownerAgent.post(url + '/reject').set(...csrf).send(review)).body.error?.code).toBe('POLICY_BLOCKED');
  expect((await ownerAgent.patch(url).set(...csrf).send({ ...review, body: 'Unapproved update' })).body.error?.code)
    .toBe('POLICY_BLOCKED');
  await drainJobs({ type: 'knowledge.index', maxMs: 30_000 });
  expect((await ownerAgent.get(url)).body.data).toMatchObject({ status: 'active', indexState: 'ready' });
  expect((await searchKnowledge(bizA, editedTitle)).hits).toContainEqual(expect.objectContaining({
    knowledgeItemId: itemId, revision: 2, citations,
  }));
  expect((await ownerAgent.post(url + '/deactivate').set(...csrf).send(review)).status).toBe(200);
  expect(await buyerSearch()).toBeUndefined();
  expect(await readWebKnowledgeAnswer(bizA, question)).toBeNull();
}, 35_000);

it('rejects a pending suggestion once, preserves its sources for review history and suppresses regeneration', async () => {
  const ownerAgent = await createTestAgent();
  const staffAgent = await createTestAgent();
  await loginAs(ownerAgent, owner.email);
  await loginAs(staffAgent, staff.email);
  const question = 'Does the Zinelia sleeve need an insert?';
  const input = { businessId: bizA, question, answer: 'An insert is optional.', citations };
  const { itemId } = await createWebKnowledgeDraft(input);
  const url = items(bizA) + '/' + itemId;
  const reject = { expectedRevision: 1 };
  expect((await staffAgent.post(url + '/reject').set(...csrf).send(reject)).status).toBe(403);
  expect((await ownerAgent.post(items(bizB) + '/' + itemId + '/reject').set(...csrf).send(reject)).status).toBe(404);
  expect((await ownerAgent.post(url + '/reject').set(...csrf).send({ expectedRevision: 2 })).body.error?.code)
    .toBe('VERSION_CONFLICT');
  const result = await ownerAgent.post(url + '/reject').set(...csrf).send(reject);
  expect(result.status).toBe(200);
  expect(result.body.data).toMatchObject({ id: itemId, status: 'deleted' });
  expect((await ownerAgent.post(url + '/reject').set(...csrf).send(reject)).body.data).toEqual(result.body.data);
  expect((await ownerAgent.get(url)).body.data).toMatchObject({ status: 'deleted', webSuggestion: { question, citations } });
  expect(await findWebKnowledgeDraft(bizA, question)).toEqual({ itemId, status: 'deleted' });
  expect(await readWebKnowledgeAnswer(bizA, question)).toBeNull();
  expect(await createWebKnowledgeDraft({ ...input, answer: 'Second attempt' })).toMatchObject({ itemId, created: false });
  expect((await searchKnowledge(bizA, question)).hits).not.toContainEqual(expect.objectContaining({ knowledgeItemId: itemId }));
}, 20_000);

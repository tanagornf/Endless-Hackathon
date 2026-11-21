import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import * as index from './index-port';
import { CreateBody, ListQuery, RevisionQuery } from './schema';
import seed from './seed';
import {
  activateKnowledgeItem, createKnowledgeItem, deactivateKnowledgeItem, deleteKnowledgeItem, getKnowledgeItem,
  getKnowledgeRevision, listKnowledgeItems, listRevisions, patchKnowledgeItem, submitKnowledgeItem,
} from './service';

vi.mock('./index-port', () => ({
  getIndexStates: vi.fn(),
  indexKnowledgeRevision: vi.fn(),
  setItemFolder: vi.fn(),
  setSearchable: vi.fn(),
}));
const bizA = SEED.businesses.find((entry) => entry.alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find((entry) => entry.alias === 'biz_demo_b')!.id;
const owner = SEED.users.find((entry) => entry.alias === 'owner_a')!;
const staff = SEED.users.find((entry) => entry.alias === 'staff_a')!;
const actor = { userId: owner.id };
const path = '/api/v1/businesses/' + bizA + '/knowledge/items';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(index.getIndexStates).mockResolvedValue({});
  vi.mocked(index.indexKnowledgeRevision).mockResolvedValue({ jobId: 'test-job', deduped: false });
  vi.mocked(index.setSearchable).mockResolvedValue(undefined);
  vi.mocked(index.setItemFolder).mockResolvedValue(undefined);
});
function makeItem(title = 'Where can I park?', body = 'Three spots at the front.') {
  return createKnowledgeItem(bizA, actor, CreateBody.parse({ kind: 'faq', title, body }));
}

function indexReady(itemId: string, revision: number) {
  vi.mocked(index.getIndexStates).mockResolvedValue({
    [itemId]: { revision, state: 'ready', error: null, indexedAt: '2026-11-21T04:00:00Z' },
  });
  return { expectedRevision: revision, acknowledgeModeration: false };
}

describe('F05 knowledge lifecycle', () => {
  it('requires review and the current index before activation', async () => {
    const { id } = await makeItem();
    await expect(activateKnowledgeItem(bizA, actor, id, { expectedRevision: 1, acknowledgeModeration: false }))
      .rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'submit_first' } });
    const reviewed = await submitKnowledgeItem(bizA, actor, id, 1);
    expect(reviewed.status).toBe('reviewed');
    expect(index.indexKnowledgeRevision).toHaveBeenCalledWith({ businessId: bizA, itemId: id, revision: 1 });
    await expect(submitKnowledgeItem(bizA, actor, id, 1))
      .rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'not_draft' } });
    await expect(deactivateKnowledgeItem(bizA, actor, id, 1))
      .rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'not_active' } });
    await expect(activateKnowledgeItem(bizA, actor, id, { expectedRevision: 1, acknowledgeModeration: false }))
      .rejects.toMatchObject({ code: 'KNOWLEDGE_NOT_READY', details: { state: 'not_started' } });
    expect((await activateKnowledgeItem(bizA, actor, id, indexReady(id, 1))).status).toBe('active');
    expect(index.setSearchable).toHaveBeenLastCalledWith({ businessId: bizA, itemId: id, revision: 1 });
    expect((await deactivateKnowledgeItem(bizA, actor, id, 1)).status).toBe('inactive');
    expect(index.setSearchable).toHaveBeenLastCalledWith({ businessId: bizA, itemId: id, revision: null });
    expect((await activateKnowledgeItem(bizA, actor, id, indexReady(id, 1))).status).toBe('active');
  });

  it('rolls back failed searchability changes and deletes idempotently', async () => {
    const { id } = await makeItem();
    await submitKnowledgeItem(bizA, actor, id, 1);
    const ready = indexReady(id, 1);
    vi.mocked(index.setSearchable).mockRejectedValueOnce(new Error('index failed'));
    await expect(activateKnowledgeItem(bizA, actor, id, ready)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect((await getKnowledgeItem(bizA, id))?.status).toBe('reviewed');
    await activateKnowledgeItem(bizA, actor, id, ready);

    vi.mocked(index.setSearchable).mockRejectedValue(new Error('index failed'));
    await expect(deactivateKnowledgeItem(bizA, actor, id, 1)).rejects.toMatchObject({ code: 'INTERNAL' });
    await expect(deleteKnowledgeItem(bizA, actor, id)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect(await getKnowledgeItem(bizA, id)).toMatchObject({ status: 'active', deletedAt: null });

    vi.mocked(index.setSearchable).mockResolvedValue(undefined);
    const deleted = await deleteKnowledgeItem(bizA, actor, id);
    expect(index.setSearchable).toHaveBeenLastCalledWith({ businessId: bizA, itemId: id, revision: null });
    expect(await deleteKnowledgeItem(bizA, actor, id)).toEqual(deleted);
    expect(await getKnowledgeRevision(bizA, id, 1)).toMatchObject({ status: 'deleted', body: 'Three spots at the front.' });
    await expect(patchKnowledgeItem(bizA, actor, id, { expectedRevision: 1, title: 'new' }))
      .rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'deleted' } });
  });

  it('rejects a review without content', async () => {
    const empty = await createKnowledgeItem(bizA, actor, CreateBody.parse({}));
    await expect(submitKnowledgeItem(bizA, actor, empty.id, 1)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await getKnowledgeItem(bizA, empty.id)).toMatchObject({ revision: 1, status: 'draft' });
  });

  it('advances only one competing revision and retains the prior active index', async () => {
    const { id } = await makeItem();
    await submitKnowledgeItem(bizA, actor, id, 1);
    await activateKnowledgeItem(bizA, actor, id, indexReady(id, 1));
    vi.mocked(index.setSearchable).mockClear();
    const results = await Promise.allSettled([
      patchKnowledgeItem(bizA, actor, id, { expectedRevision: 1, title: 'Parking near the shop' }),
      patchKnowledgeItem(bizA, actor, id, { expectedRevision: 1, title: 'Parking hours' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected?.reason).toMatchObject({ code: 'VERSION_CONFLICT', details: { currentRevision: 2 } });
    expect(index.setSearchable).not.toHaveBeenCalled();
    expect(index.indexKnowledgeRevision).toHaveBeenLastCalledWith({ businessId: bizA, itemId: id, revision: 2 });
    expect(await getKnowledgeItem(bizA, id)).toMatchObject({ status: 'active', revision: 2, indexState: 'not_started' });
    expect(await getKnowledgeRevision(bizA, id, 1)).toMatchObject({ title: 'Where can I park?', isCurrent: false });
    expect((await listRevisions(bizA, id, RevisionQuery.parse({}))).items.map((row) => row.revision)).toEqual([2, 1]);
  });

  it('leaves the revision unchanged for folder-only edits and scopes folders and items to a shop', async () => {
    const aFolder = SEED.knowledgeFolders.find((entry) => entry.businessAlias === 'biz_demo_a')!;
    const bFolder = SEED.knowledgeFolders.find((entry) => entry.businessAlias === 'biz_demo_b')!;
    const bItem = SEED.knowledge.find((entry) => entry.businessAlias === 'biz_demo_b')!;
    const item = await makeItem();
    expect(await patchKnowledgeItem(bizA, actor, item.id, { expectedRevision: 1, folderId: aFolder.id }))
      .toMatchObject({ revision: 1, folderId: aFolder.id });
    expect(index.setItemFolder).toHaveBeenLastCalledWith({ businessId: bizA, itemId: item.id, folderId: aFolder.id });
    await expect(patchKnowledgeItem(bizA, actor, item.id, { expectedRevision: 1, folderId: bFolder.id }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(createKnowledgeItem(bizA, actor, CreateBody.parse({ folderId: bFolder.id })))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(deleteKnowledgeItem(bizA, actor, bItem.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await getKnowledgeItem(bizA, bItem.id)).toBeNull();
    expect(await getKnowledgeRevision(bizA, bItem.id, 1)).toBeNull();
    const visible = (await listKnowledgeItems(bizA, ListQuery.parse({}))).items.map((entry) => entry.id);
    expect(visible).toContain(item.id);
    expect(visible).not.toContain(bItem.id);
  });
});

describe('F05 knowledge routes and seed', () => {
  it('keeps ten deterministic items and the deleted item snapshots on repeat seed', async () => {
    const aliases = new Map([...SEED.businesses, ...SEED.knowledge, ...SEED.knowledgeFolders].map((entry) => [entry.alias, entry.id]));
    const context = { db, fixtures: SEED, id: (alias: string) => aliases.get(alias)!, log: () => {} };
    await seed.run(context);
    const seeded = await db.query<{ id: string }>(
      "SELECT id FROM knowledge_items WHERE business_id=ANY($1::uuid[]) AND source='seed'", [[bizA, bizB]]);
    expect(seeded.rows.map((entry) => entry.id).sort()).toEqual(SEED.knowledge.map((entry) => entry.id).sort());
    const deleted = SEED.knowledge.find((entry) => entry.alias === 'kn_a_deleted')!;
    expect(await getKnowledgeRevision(bizA, deleted.id, 1)).toMatchObject({ body: 'ราคา 990 บาท', status: 'deleted' });
    expect((await listRevisions(bizA, deleted.id, RevisionQuery.parse({}))).items).toHaveLength(2);
  });

  it('allows staff reads and applies write/delete permissions, validation, and tenant boundaries', async () => {
    const author = await createTestAgent();
    await loginAs(author, owner.email);
    const reader = await createTestAgent();
    await loginAs(reader, staff.email);
    const created = await author.post(path).set('X-Requested-With', 'nless')
      .send({ kind: 'faq', title: 'Do you ship?', body: 'We ship nationwide.' });
    expect(created.status).toBe(201);
    const id = String(created.body.data.id);
    const target = path + '/' + id;
    expect((await reader.get(target)).body.data.body).toBe('We ship nationwide.');
    const denied = await reader.patch(target).set('X-Requested-With', 'nless').send({ expectedRevision: 1, title: 'changed' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
    expect((await reader.post(path).set('X-Requested-With', 'nless').send({})).status).toBe(403);
    expect((await reader.delete(target).set('X-Requested-With', 'nless')).status).toBe(403);
    expect((await author.post(path).set('X-Requested-With', 'nless').send({ body: 'x'.repeat(20001) })).status).toBe(400);
    expect((await author.patch(target).set('X-Requested-With', 'nless').send({ expectedRevision: 1 })).status).toBe(400);
    const bItem = SEED.knowledge.find((entry) => entry.businessAlias === 'biz_demo_b')!;
    expect((await author.get(path + '/' + bItem.id)).status).toBe(404);
    expect((await author.delete(target).set('X-Requested-With', 'nless')).status).toBe(200);
    expect((await author.delete(target).set('X-Requested-With', 'nless')).status).toBe(200);
  });

  it('escapes wildcard search terms and paginates without repeats', async () => {
    const account = await createTestAgent();
    await loginAs(account, owner.email);
    const percent = await makeItem('100% synthetic keyword');
    const escaped = await account.get(path).query({ q: '%' });
    expect(escaped.body.data.items.map((item: { id: string }) => item.id)).toEqual([percent.id]);
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const response = await account.get(path).query({ limit: 2, ...(cursor ? { cursor } : {}) });
      expect(response.status).toBe(200);
      for (const entry of response.body.data.items) {
        expect(seen.has(entry.id)).toBe(false);
        seen.add(entry.id);
      }
      cursor = response.body.data.nextCursor ?? undefined;
    } while (cursor);
    expect(seen.size).toBeGreaterThan(2);
    expect((await account.get(path).query({ cursor: 'malformed' })).status).toBe(400);
  });
});

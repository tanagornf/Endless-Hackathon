import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { db, drainJobs, jobs } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { searchKnowledge } from '../knowledge-search/service';
import {
  activateKnowledgeItem, createFolder, createKnowledgeDraft, createKnowledgeItem, deleteFolder, deleteKnowledgeItem,
  ensureKnowledgeFolder, getKnowledgeItem, getKnowledgeRevision, listFolders, renameFolder, submitKnowledgeItem,
} from './service';

const bizA = SEED.businesses.find((entry) => entry.alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find((entry) => entry.alias === 'biz_demo_b')!.id;
const owner = SEED.users.find((entry) => entry.alias === 'owner_a')!;
const staff = SEED.users.find((entry) => entry.alias === 'staff_a')!;
const actor = { userId: owner.id };
const folderPath = '/api/v1/businesses/' + bizA + '/knowledge/folders';
const csrf = ['X-Requested-With', 'nless'] as const;

it('normalizes folder names, deduplicates concurrent ensures, and keeps matching names in each tenant', async () => {
  const suffix = randomUUID();
  const name = 'FAQ ' + suffix;
  const [first, second] = await Promise.all([
    ensureKnowledgeFolder(bizA, '  ＦＡＱ ' + suffix + ' ', owner.id),
    ensureKnowledgeFolder(bizA, name.toLowerCase(), actor.userId),
  ]);
  expect([first.created, second.created].sort()).toEqual([false, true]);
  expect(first.id).toBe(second.id);
  expect(first.name).toBe(second.name);
  expect(first.name.toLowerCase()).toBe(name.toLowerCase());

  const other = await ensureKnowledgeFolder(bizB, name, null);
  expect(other.created).toBe(true);
  expect(other.id).not.toBe(first.id);
  await expect(createFolder(bizA, actor, name.toLowerCase()))
    .rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { code: 'folder_name_taken' } });
  await expect(renameFolder(bizA, actor, other.id, 'cross tenant'))
    .rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(deleteFolder(bizA, actor, other.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  for (const invalid of ['', 'tabs\t', 'new\nline', 'hidden\u202E', 'x'.repeat(101)]) {
    await expect(ensureKnowledgeFolder(bizA, invalid, owner.id))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR', details: { code: 'folder_name_invalid' } });
  }
}, 20_000);

it('counts nondeleted items and removes folder associations without deleting knowledge', async () => {
  const folder = await createFolder(bizA, actor, 'Synthetic folder ' + randomUUID());
  const item = await createKnowledgeItem(bizA, actor, { kind: 'faq', title: 'Folder test', body: 'Body', folderId: folder.id });
  const removed = await createKnowledgeItem(bizA, actor, { kind: 'faq', title: 'Soft delete', body: 'Body', folderId: folder.id });
  await deleteKnowledgeItem(bizA, actor, removed.id);

  expect((await listFolders(bizA)).items.find((row) => row.id === folder.id)).toMatchObject({ itemCount: 1 });
  const renamed = await renameFolder(bizA, actor, folder.id, 'Test renamed ' + randomUUID());
  expect(renamed).toMatchObject({ id: folder.id, itemCount: 1 });
  expect((await listFolders(bizB)).items).not.toContainEqual(expect.objectContaining({ id: folder.id }));

  await deleteFolder(bizA, actor, folder.id);
  expect((await listFolders(bizA)).items).not.toContainEqual(expect.objectContaining({ id: folder.id }));
  expect(await getKnowledgeItem(bizA, item.id)).toMatchObject({ status: 'draft', folderId: null, revision: 1 });
  expect(await getKnowledgeItem(bizA, removed.id)).toMatchObject({ status: 'deleted', folderId: null });
  expect(await getKnowledgeRevision(bizA, item.id, 1)).toMatchObject({ folderId: folder.id });
}, 20_000);


it('removes folder search filtering while preserving an active indexed item', async () => {
  await createTestAgent();
  const folder = await createFolder(bizA, actor, 'Search folder ' + randomUUID());
  const marker = 'FOLDER-SEARCH-41';
  const item = await createKnowledgeItem(bizA, actor, {
    kind: 'faq', title: 'Indexed folder sample', body: 'Reference ' + marker, folderId: folder.id,
  });
  await submitKnowledgeItem(bizA, actor, item.id, 1);
  await drainJobs({ type: 'knowledge.index', maxMs: 30_000 });
  await activateKnowledgeItem(bizA, actor, item.id, { expectedRevision: 1, acknowledgeModeration: false });
  const before = await searchKnowledge(bizA, marker, { folderIds: [folder.id] });
  expect(before.hits[0]).toMatchObject({ knowledgeItemId: item.id, folderId: folder.id });
  await deleteFolder(bizA, actor, folder.id);
  expect((await searchKnowledge(bizA, marker, { folderIds: [folder.id] })).hits).toEqual([]);
  expect((await searchKnowledge(bizA, marker)).hits[0]).toMatchObject({ knowledgeItemId: item.id, folderId: null });
}, 20_000);

it('creates one imported draft per tenant and request ID without indexing', async () => {
  const sourceRef = randomUUID();
  const folder = await ensureKnowledgeFolder(bizA, 'Import destination ' + randomUUID(), owner.id);
  const input = {
    businessId: bizA, actorUserId: owner.id, kind: 'faq' as const, title: 'Imported ' + randomUUID(),
    body: 'English and Thai fixture', folderId: folder.id, sourceRef, clientRequestId: sourceRef + ':1',
  };
  const enqueue = vi.spyOn(jobs, 'enqueue');
  try {
    const attempts = await Promise.all([createKnowledgeDraft(input), createKnowledgeDraft(input)]);
    expect(attempts.filter((result) => result.created)).toHaveLength(1);
    expect(attempts[0].itemId).toBe(attempts[1].itemId);
    const itemId = attempts[0].itemId;
    expect(await getKnowledgeItem(bizA, itemId)).toMatchObject({
      status: 'draft', revision: 1, source: 'import', folderId: folder.id, indexState: 'not_started',
    });
    expect(await getKnowledgeItem(bizB, itemId)).toBeNull();
    expect(await getKnowledgeRevision(bizA, itemId, 1)).toMatchObject({ title: input.title, body: input.body, isCurrent: true });
    const row = await db.one<{ source_ref: string }>(
      'SELECT source_ref FROM knowledge_items WHERE business_id=$1 AND id=$2', [bizA, itemId],
    );
    expect(row.source_ref).toBe(sourceRef);
    await expect(createKnowledgeDraft({ ...input, businessId: bizB, actorUserId: null, clientRequestId: sourceRef + ':2' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    const other = await createKnowledgeDraft({ ...input, businessId: bizB, actorUserId: null, folderId: null });
    expect(other.created).toBe(true);
    expect(other.itemId).not.toBe(itemId);
    expect(enqueue).not.toHaveBeenCalled();
  } finally { enqueue.mockRestore(); }
}, 20_000);

it('validates imported content and warns about duplicate titles/content only within a shop', async () => {
  const sourceRef = randomUUID();
  const request = {
    businessId: bizA, actorUserId: owner.id, title: 'Duplicate title ' + randomUUID(), body: 'Original answer',
    sourceRef, clientRequestId: sourceRef + ':1',
  };
  for (const invalid of [{ title: '', body: ' ' }, { title: 'a'.repeat(256) }, { body: 'x'.repeat(20001) }]) {
    await expect(createKnowledgeDraft({ ...request, ...invalid })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  }
  const original = await createKnowledgeDraft(request);
  const different = await createKnowledgeDraft({ ...request, clientRequestId: sourceRef + ':2', body: 'Another answer' });
  expect(different.warnings).toContainEqual({ code: 'duplicate_title', itemId: original.itemId });
  const same = await createKnowledgeDraft({ ...request, clientRequestId: sourceRef + ':3' });
  expect(same.warnings).toContainEqual({ code: 'duplicate_content', itemId: original.itemId });
  const other = await createKnowledgeDraft({ ...request, actorUserId: null, businessId: bizB, clientRequestId: sourceRef + ':4' });
  expect(other.warnings).toEqual([]);
}, 20_000);

it('guards real folder routes with read, write and delete permissions', async () => {
  const ownerAgent = await createTestAgent();
  const staffAgent = await createTestAgent();
  await loginAs(ownerAgent, owner.email);
  await loginAs(staffAgent, staff.email);
  const name = 'Folder route ' + randomUUID();
  const created = await ownerAgent.post(folderPath).set(...csrf).send({ name });
  expect(created.status).toBe(201);
  const url = folderPath + '/' + created.body.data.id;
  expect((await staffAgent.get(folderPath)).body.data.items).toContainEqual(expect.objectContaining({ name }));
  expect((await staffAgent.post(folderPath).set(...csrf).send({ name })).status).toBe(403);
  expect((await staffAgent.patch(url).set(...csrf).send({ name: 'Denied' })).status).toBe(403);
  expect((await staffAgent.delete(url).set(...csrf)).status).toBe(403);
  expect((await ownerAgent.patch(url).set(...csrf).send({ name: 'Renamed ' + randomUUID() })).status).toBe(200);
  expect((await ownerAgent.delete(url).set(...csrf)).status).toBe(204);
  expect((await ownerAgent.get('/api/v1/businesses/' + bizB + '/knowledge/folders')).status).toBe(404);
}, 20_000);

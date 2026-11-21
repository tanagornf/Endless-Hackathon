import { z } from 'zod';
import { AppError, assertRateLimit, defineFeatureRoutes } from '../../core';
import { ActivateBody, CreateBody, ExpectedRevision, ListQuery, PatchBody, RevisionQuery } from './schema';
import {
  activateKnowledgeItem, createFolder, createKnowledgeItem, deactivateKnowledgeItem, deleteFolder, deleteKnowledgeItem, getKnowledgeItem,
  getKnowledgeRevision, listFolders, listKnowledgeItems, listRevisions, patchKnowledgeItem, reindexKnowledgeItem, renameFolder, submitKnowledgeItem,
} from './service';

const items = '/businesses/:businessId/knowledge/items';
const item = items + '/:itemId';
const folders = '/businesses/:businessId/knowledge/folders';
const FolderId = z.string().uuid();
const FolderBody = z.object({ name: z.string() }).strict();
function checkedFolderId(value: string): string {
  if (!FolderId.safeParse(value).success) throw new AppError('NOT_FOUND', 'Knowledge folder not found');
  return value;
}

const read = { auth: 'business', permission: 'product.read' } as const;
const write = { auth: 'business', permission: 'product.write' } as const;
const remove = { auth: 'business', permission: 'product.delete' } as const;

export default defineFeatureRoutes({
  featureId: 'F05',
  slug: 'knowledge',
  register(api) {
    api.get(folders, { ...read, summary: 'List knowledge folders' }, async ({ business }) => listFolders(business!.id));
    api.post(folders, { ...write, body: FolderBody, summary: 'Create knowledge folder' }, async ({ business, user, body }) => ({
      kind: 'json', status: 201, data: await createFolder(business!.id, { userId: user!.id }, body.name),
    }));
    api.patch(folders + '/:folderId', { ...write, body: FolderBody, summary: 'Rename knowledge folder' },
      async ({ business, user, params, body }) => renameFolder(business!.id, { userId: user!.id }, checkedFolderId(params.folderId), body.name));
    api.delete(folders + '/:folderId', { ...remove, summary: 'Delete knowledge folder' }, async ({ business, user, params }) => {
      await deleteFolder(business!.id, { userId: user!.id }, checkedFolderId(params.folderId));
      return { kind: 'no_content' };
    });

    api.get(items, { ...read, query: ListQuery, summary: 'List knowledge' },
      async ({ business, query }) => listKnowledgeItems(business!.id, query));
    api.post(items, { ...write, body: CreateBody, summary: 'Create knowledge draft' },
      async ({ business, user, body }) => ({
        kind: 'json', status: 201, data: await createKnowledgeItem(business!.id, { userId: user!.id }, body),
      }));
    api.get(item, { ...read, summary: 'Get knowledge item' }, async ({ business, params }) => {
      const found = await getKnowledgeItem(business!.id, params.itemId);
      if (!found) throw new AppError('NOT_FOUND', 'Knowledge item not found');
      return found;
    });
    api.patch(item, { ...write, body: PatchBody, summary: 'Update knowledge' },
      async ({ business, user, params, body }) => patchKnowledgeItem(business!.id, { userId: user!.id }, params.itemId, body));
    api.post(item + '/submit', { ...write, body: ExpectedRevision, summary: 'Submit knowledge for review' },
      async ({ business, user, params, body }) => submitKnowledgeItem(business!.id, { userId: user!.id }, params.itemId, body.expectedRevision));
    api.post(item + '/activate', { ...write, body: ActivateBody, summary: 'Activate knowledge' },
      async ({ business, user, params, body }) => activateKnowledgeItem(business!.id, { userId: user!.id }, params.itemId, body));
    api.post(item + '/deactivate', { ...write, body: ExpectedRevision, summary: 'Deactivate knowledge' },
      async ({ business, user, params, body }) => deactivateKnowledgeItem(business!.id, { userId: user!.id }, params.itemId, body.expectedRevision));
    api.delete(item, { ...remove, summary: 'Delete knowledge' },
      async ({ business, user, params }) => deleteKnowledgeItem(business!.id, { userId: user!.id }, params.itemId));
    api.post(item + '/reindex', { ...write, summary: 'Rebuild knowledge index' },
      async ({ business, user, params }) => {
        const businessId = business!.id;
        assertRateLimit({ key: 'knowledge:reindex:' + businessId, limit: 10, windowSeconds: 60 });
        return reindexKnowledgeItem(businessId, { userId: user!.id }, params.itemId);
      });
    api.get(item + '/revisions', { ...read, query: RevisionQuery, summary: 'List knowledge revisions' },
      async ({ business, params, query }) => listRevisions(business!.id, params.itemId, query));
    api.get(item + '/revisions/:revision', { ...read, summary: 'Get knowledge revision' },
      async ({ business, params }) => {
        const revision = Number(params.revision);
        if (!/^[1-9]\d*$/.test(params.revision) || revision > 2_147_483_647) {
          throw new AppError('NOT_FOUND', 'Knowledge revision not found');
        }
        const found = await getKnowledgeRevision(business!.id, params.itemId, revision);
        if (!found) throw new AppError('NOT_FOUND', 'Knowledge revision not found');
        const { status: _status, currentRevision: _revision, ...detail } = found;
        return detail;
      });
  },
});

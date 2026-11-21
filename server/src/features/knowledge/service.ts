import { findItem, itemDetail } from './repo';
import { AppError, db } from '../../core';
import type { DbExecutor } from '../../core';
import type { KnowledgeStatus } from '@nless/shared/core/types';
import type { KnowledgeItemDetail } from '@nless/shared/features/knowledge/types';

export { createKnowledgeDraft } from './drafts';
export { createOwnerConsultKnowledgeDraft } from './owner-consult-drafts';
export { createWebKnowledgeDraft, findWebKnowledgeDraft, getActiveWebKnowledgeCitations, readWebKnowledgeAnswer } from './web-suggestions';
export { createFolder, deleteFolder, ensureKnowledgeFolder, listFolders, renameFolder } from './folders';

export {
  createKnowledgeItem, patchKnowledgeItem, submitKnowledgeItem, activateKnowledgeItem,
  deactivateKnowledgeItem, deleteKnowledgeItem, reindexKnowledgeItem, rejectWebKnowledgeDraft,
} from './lifecycle';
export { findRevision as getKnowledgeRevision, listItems as listKnowledgeItems, listRevisions } from './repo';

export async function getKnowledgeItem(businessId: string, itemId: string): Promise<KnowledgeItemDetail | null> {
  const item = await findItem(businessId, itemId);
  return item ? itemDetail(item) : null;
}


/** Locks the knowledge row for index publication. Item mutations acquire the same row lock when they update it. */
export async function withKnowledgePublication<T>(
  businessId: string,
  itemId: string,
  publish: (tx: DbExecutor, current: { revision: number; status: KnowledgeStatus; folderId: string | null }) => Promise<T>,
): Promise<T> {
  return db.tx(async (tx) => {
    const current = await tx.maybeOne<{ revision: number; status: KnowledgeStatus; folderId: string | null }>(
      'SELECT revision,status,folder_id AS "folderId" FROM knowledge_items WHERE business_id=$1 AND id=$2 FOR UPDATE',
      [businessId, itemId],
    );
    if (!current) throw new AppError('NOT_FOUND', 'Knowledge item not found');
    return publish(tx, current);
  });
}


/** Confirms that published candidates still belong to active items in this business. */
export async function getActiveKnowledgeItemIds(
  businessId: string, itemIds: string[], executor: DbExecutor = db,
): Promise<Set<string>> {
  if (!itemIds.length) return new Set();
  const { rows } = await executor.query<{ id: string }>(
    "SELECT id FROM knowledge_items WHERE business_id=$1 AND id=ANY($2::uuid[]) AND status='active'",
    [businessId, itemIds],
  );
  return new Set(rows.map((row) => row.id));
}

import { findItem, itemDetail } from './repo';
import { AppError, db } from '../../core';
import type { DbExecutor } from '../../core';
import type { KnowledgeStatus } from '@nless/shared/core/types';
import type { KnowledgeDraftInput, KnowledgeDraftResult, KnowledgeItemDetail } from '@nless/shared/features/knowledge/types';

/**
 * @owner F05 knowledge · B1 · consumer: B3 (F06 knowledge-import)
 * Writes ONE knowledge item as status 'draft' (source 'import'); never active, never indexed (the shop reviews and
 * submits it in /knowledge). Moderation runs at submit, not here. Empty title AND body → VALIDATION_ERROR.
 * Audit knowledge.item.create. Idempotent by clientRequestId. Does not publish realtime events.
 * @fake inserts nothing: returns { itemId: `fake-draft-<clientRequestId>`, revision: 1, created: true, warnings: [] }.
 */
export async function createKnowledgeDraft(input: KnowledgeDraftInput): Promise<KnowledgeDraftResult> {
  throw new AppError("SERVICE_NOT_READY", "createKnowledgeDraft is not implemented");
}

/**
 * @owner F05 knowledge · B1 · consumer: B3 (F06)
 * Finds a folder by name (trimmed, case-insensitive) or creates it. Name rules as the folder routes
 * (1–100 chars, one line) else VALIDATION_ERROR.
 * @fake { id: `fake-folder-<lowercased name>`, name, created: true }.
 */
export async function ensureKnowledgeFolder(
  businessId: string, name: string, actorUserId: string | null,
): Promise<{ id: string; name: string; created: boolean }> {
  throw new AppError("SERVICE_NOT_READY", "ensureKnowledgeFolder is not implemented");
}


export {
  createKnowledgeItem, patchKnowledgeItem, submitKnowledgeItem, activateKnowledgeItem,
  deactivateKnowledgeItem, deleteKnowledgeItem, reindexKnowledgeItem,
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

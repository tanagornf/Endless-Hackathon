import { AppError } from '../../core';
import type { KnowledgeDraftInput, KnowledgeDraftResult } from '@nless/shared/features/knowledge/types';

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

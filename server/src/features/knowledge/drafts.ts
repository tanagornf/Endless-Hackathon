import { AppError, audit, db, publish } from '../../core';
import type { DbExecutor } from '../../core';
import type { KnowledgeDraftInput, KnowledgeDraftResult, WebKnowledgeSuggestion } from '@nless/shared/features/knowledge/types';
import { contentHash, normalizeContent } from './hash';
import { assertFolder, duplicateWarnings, requireItem, snapshot } from './repo';
import { CreateBody } from './schema';

function priorDraft(tx: DbExecutor, businessId: string, requestId: string): Promise<{ id: string } | null> {
  return tx.maybeOne<{ id: string }>(
    'SELECT id FROM knowledge_items WHERE business_id=$1 AND client_request_id=$2', [businessId, requestId],
  );
}

export function createKnowledgeDraft(input: KnowledgeDraftInput): Promise<KnowledgeDraftResult> {
  return storeKnowledgeDraft(input, null);
}

export async function storeKnowledgeDraft(input: KnowledgeDraftInput, webSuggestion: WebKnowledgeSuggestion | null): Promise<KnowledgeDraftResult> {
  const { businessId, sourceRef, clientRequestId, actorUserId } = input;
  const content = CreateBody.safeParse({ kind: input.kind, title: input.title, body: input.body, folderId: input.folderId });
  if (!content.success || !sourceRef?.trim() || !clientRequestId?.trim() ||
      (!normalizeContent(content.data.title) && !normalizeContent(content.data.body))) {
    throw new AppError('VALIDATION_ERROR', 'Invalid knowledge draft');
  }
  const { kind, title, body, folderId } = content.data;
  const hash = contentHash(title, body);

  const result = await db.tx(async (tx) => {
    const existing = await priorDraft(tx, businessId, clientRequestId);
    if (existing) return { item: await requireItem(businessId, existing.id, tx), created: false };
    await assertFolder(businessId, folderId, tx);
    const inserted = await tx.maybeOne<{ id: string }>(
      'INSERT INTO knowledge_items (business_id,folder_id,kind,title,body,content_hash,source,source_ref,client_request_id,created_by,updated_by,web_suggestion) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11) ' +
      'ON CONFLICT (business_id,client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING RETURNING id',
      [businessId, folderId, kind, title, body, hash, webSuggestion ? 'web' : 'import', sourceRef, clientRequestId,
        actorUserId, webSuggestion ? JSON.stringify(webSuggestion) : null],
    );
    if (inserted) {
      const item = await requireItem(businessId, inserted.id, tx);
      await snapshot(tx, item, actorUserId);
      return { item, created: true };
    }
    const raced = await priorDraft(tx, businessId, clientRequestId);
    if (!raced) throw new AppError('SERVICE_NOT_READY', 'Knowledge draft changed during creation', { retryable: true });
    return { item: await requireItem(businessId, raced.id, tx), created: false };
  });
  if (result.created) {
    await audit({ businessId, actorUserId, action: 'knowledge.item.create', targetType: 'knowledge_item', targetId: result.item.id });
    if (webSuggestion) publish(businessId, { type: 'knowledge.status', knowledgeItemId: result.item.id, indexState: 'not_started' });
  }
  const warnings = (await duplicateWarnings(result.item)).map(({ code, itemId }) => ({ code, itemId }));
  return { itemId: result.item.id, revision: result.item.revision, created: result.created, warnings };
}

import { AppError, config, db } from '../../core';
import type { IndexStatus, SourceView } from '@nless/shared/features/knowledge-search/types';
import type { KnowledgeItemRow } from '@nless/shared/features/knowledge/types';
import { getKnowledgeRevision, listKnowledgeItems } from '../knowledge/service';
import { INDEX_DIMENSIONS } from './config';

export async function listBusinessKnowledge(businessId: string): Promise<KnowledgeItemRow[]> {
  const items: KnowledgeItemRow[] = [];
  let cursor: string | undefined;
  do {
    const page = await listKnowledgeItems(businessId, { cursor, limit: 200, includeDeleted: false });
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

export async function readIndexStatus(businessId: string): Promise<IndexStatus> {
  const fake = config.MODEL_MODE === 'fake';
  const embedModel = fake ? 'fake-hash' : config.OPENAI_EMBED_MODEL;
  const items = await listBusinessKnowledge(businessId);
  const counts = { not_started: 0, indexing: 0, ready: 0, failed: 0 };
  for (const item of items) counts[item.indexState]++;
  const activeIds = items.filter((item) => item.status === 'active').map((item) => item.id);
  const stats = await db.one<{ chunks: number; searchable_items: number; stale: number; last_at: Date | null }>(
    `SELECT count(*)::int AS chunks,
      count(DISTINCT item_id) FILTER (WHERE searchable AND item_id=ANY($4::uuid[]))::int AS searchable_items,
      count(*) FILTER (WHERE embed_model<>$2 OR embed_dim<>$3)::int AS stale,
      (SELECT max(indexed_at) FROM knowledge_index_states WHERE business_id=$1) AS last_at
    FROM knowledge_chunks WHERE business_id=$1`, [businessId, embedModel, INDEX_DIMENSIONS, activeIds],
  );
  return {
    mode: fake ? 'fake' : 'real', embedModel, embedDim: INDEX_DIMENSIONS, counts,
    searchableItems: stats.searchable_items, chunkCount: stats.chunks, staleModelChunks: stats.stale,
    lastIndexedAt: stats.last_at?.toISOString() ?? null,
  };
}

export async function readSource(businessId: string, itemId: string, revisionText: string): Promise<SourceView> {
  const revision = /^[1-9]\d*$/.test(revisionText) ? Number(revisionText) : NaN;
  const source = Number.isSafeInteger(revision) && revision <= 2_147_483_647
    ? await getKnowledgeRevision(businessId, itemId, revision) : null;
  if (!source) throw new AppError('NOT_FOUND', 'Knowledge source not found');
  const { rows } = await db.query<{ chunkNo: number; text: string }>(
    'SELECT chunk_no AS "chunkNo",text FROM knowledge_chunks WHERE business_id=$1 AND item_id=$2 AND revision=$3 ORDER BY chunk_no',
    [businessId, itemId, revision],
  );
  return {
    knowledgeItemId: itemId, revision, title: source.title, body: source.body, status: source.status,
    isCurrent: source.currentRevision === revision, chunks: rows,
  };
}

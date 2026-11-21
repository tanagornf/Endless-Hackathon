import { AppError, db, jobs } from '../../core';
import type { DbExecutor } from '../../core';
import type { KnowledgeIndexState } from '@nless/shared/core/types';
import type { KnowledgeIndexView } from '@nless/shared/features/knowledge/types';
import { withKnowledgePublication } from '../knowledge/service';

export const INDEX_JOB = 'knowledge.index';
export type IndexInput = { businessId: string; itemId: string; revision: number };
export type IndexPayload = IndexInput & { generation: number };

export async function indexKnowledgeRevision(input: IndexInput): Promise<{ jobId: string; deduped: boolean }> {
  const { businessId, itemId, revision } = input;
  const { generation } = await withKnowledgePublication(businessId, itemId, async (tx, current) => {
    if (current.revision !== revision || current.status === 'draft' || current.status === 'deleted') {
      throw new AppError('POLICY_BLOCKED', 'Knowledge revision is unavailable for indexing');
    }
    return tx.one<{ generation: number }>(
      "INSERT INTO knowledge_index_states AS idx (business_id,item_id,revision,state,generation) VALUES ($1,$2,$3,'not_started',1) " +
      "ON CONFLICT (item_id,revision) DO UPDATE SET generation=idx.generation+CASE WHEN idx.state IN ('ready','failed') THEN 1 ELSE 0 END," +
      "state=CASE WHEN idx.state IN ('ready','failed') THEN 'not_started' ELSE idx.state END,updated_at=now() " +
      'WHERE idx.business_id=$1 RETURNING generation',
      [businessId, itemId, revision],
    );
  });
  return jobs.enqueue(INDEX_JOB, { ...input, generation }, {
    businessId, lockKey: 'knowledge:' + itemId, maxAttempts: 3,
    dedupKey: 'knowledge.index:' + itemId + ':' + revision + ':' + generation,
  });
}

export async function writeSearchability(
  tx: DbExecutor, businessId: string, itemId: string, revision: number | null,
): Promise<void> {
  await tx.query(
    'UPDATE knowledge_chunks SET searchable=COALESCE(revision=$3::int,false) WHERE business_id=$1 AND item_id=$2',
    [businessId, itemId, revision],
  );
}

export async function setSearchable({ businessId, itemId, revision }: {
  businessId: string; itemId: string; revision: number | null;
}): Promise<void> {
  await withKnowledgePublication(businessId, itemId, async (tx, current) => {
    if (revision === null) {
      if (current.status !== 'active') await writeSearchability(tx, businessId, itemId, null);
      return;
    }
    if (current.status !== 'active' || current.revision !== revision) return;
    const ready = await tx.maybeOne(
      "SELECT 1 FROM knowledge_index_states WHERE business_id=$1 AND item_id=$2 AND revision=$3 AND state='ready'",
      [businessId, itemId, revision],
    );
    if (!ready) throw new AppError('KNOWLEDGE_NOT_READY', 'Knowledge index is not ready');
    await writeSearchability(tx, businessId, itemId, revision);
  });
}

export async function setItemFolder({ businessId, itemId, folderId }: {
  businessId: string; itemId: string; folderId: string | null;
}): Promise<void> {
  await withKnowledgePublication(businessId, itemId, async (tx, current) => {
    if (current.folderId !== folderId) return;
    await tx.query('UPDATE knowledge_chunks SET folder_id=$3 WHERE business_id=$1 AND item_id=$2', [businessId, itemId, folderId]);
  });
}

interface IndexStateRow {
  item_id: string;
  revision: number;
  state: KnowledgeIndexState;
  error: string | null;
  indexed_at: Date | null;
}

export async function getIndexStates(businessId: string, itemIds: string[]): Promise<Record<string, KnowledgeIndexView>> {
  if (!itemIds.length) return {};
  const { rows } = await db.query<IndexStateRow>(
    'SELECT DISTINCT ON (item_id) item_id,revision,state,error,indexed_at FROM knowledge_index_states ' +
    'WHERE business_id=$1 AND item_id=ANY($2::uuid[]) ORDER BY item_id,revision DESC',
    [businessId, itemIds],
  );
  const states = new Map(rows.map((row) => [row.item_id, {
    revision: row.revision, state: row.state, error: row.error, indexedAt: row.indexed_at?.toISOString() ?? null,
  }]));
  return Object.fromEntries(itemIds.map((id) => [
    id, states.get(id.toLowerCase()) ?? { revision: 0, state: 'not_started', error: null, indexedAt: null },
  ]));
}

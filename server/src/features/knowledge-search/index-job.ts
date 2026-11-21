import { AppError, db, model, publish } from '../../core';
import type { DbExecutor, JobHandler } from '../../core';
import { getKnowledgeRevision, withKnowledgePublication } from '../knowledge/service';
import { chunkKnowledge } from './chunker';
import type { Chunk } from './chunker';
import { EMBED_BATCH, INDEX_DIMENSIONS, MAX_CHUNKS_PER_ITEM } from './config';
import { pruneQueryCache } from './embed-cache';
import { writeSearchability } from './indexing';
import type { IndexInput, IndexPayload } from './indexing';

class InvalidIndexDocument extends AppError {
  constructor(readonly reason: 'empty' | 'too_large' | 'embed_failed') {
    super('VALIDATION_ERROR', 'Knowledge document cannot be indexed');
  }
}

async function embedDocument(businessId: string, chunks: Chunk[], signal?: AbortSignal) {
  let embedModel: string | undefined;
  const vectors: number[][] = [];
  for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH) {
    signal?.throwIfAborted();
    const texts = chunks.slice(offset, offset + EMBED_BATCH).map((chunk) => chunk.text);
    const result = await model.embed({
      usage: { featureId: 'F07', purpose: 'embed-document', businessId }, texts, purpose: 'document',
    });
    const modelName = result.mode === 'fake' ? 'fake-hash' : result.model;
    if (result.dim !== INDEX_DIMENSIONS || result.vectors.length !== texts.length ||
        result.vectors.some((vector) => vector.length !== INDEX_DIMENSIONS || vector.some((value) => !Number.isFinite(value))) ||
        (embedModel !== undefined && embedModel !== modelName)) {
      throw new InvalidIndexDocument('embed_failed');
    }
    embedModel = modelName;
    vectors.push(...result.vectors);
  }
  if (!embedModel) throw new InvalidIndexDocument('embed_failed');
  return { embedModel, vectors };
}

async function failIndex(tx: DbExecutor, input: IndexInput, reason: string, generation?: number) {
  await tx.query(
    "UPDATE knowledge_index_states SET state='failed',error=$4,updated_at=now() WHERE business_id=$1 AND item_id=$2 AND revision=$3 AND ($5::int IS NULL OR generation=$5)",
    [input.businessId, input.itemId, input.revision, reason, generation ?? null],
  );
}

export async function indexDocument(input: IndexInput, options?: {
  signal?: AbortSignal; seedHistorical?: boolean; lastAttempt?: boolean; generation?: number;
}): Promise<void> {
  const { businessId, itemId, revision } = input;
  const revisionView = await getKnowledgeRevision(businessId, itemId, revision);
  if (!revisionView) {
    await failIndex(db, input, 'not_found', options?.generation);
    throw new AppError('NOT_FOUND', 'Knowledge revision not found');
  }
  const eligible = (status: typeof revisionView.status, currentRevision: number) =>
    currentRevision === revision && status !== 'draft' && (status !== 'deleted' || options?.seedHistorical);
  if (!eligible(revisionView.status, revisionView.currentRevision)) {
    await failIndex(db, input, 'superseded', options?.generation);
    return;
  }
  const started = await db.maybeOne<{ generation: number }>(
    'INSERT INTO knowledge_index_states AS idx (business_id,item_id,revision,state,attempts,started_at,generation) ' +
    "VALUES ($1,$2,$3,'indexing',1,now(),COALESCE($4::int,0)) ON CONFLICT (item_id,revision) DO UPDATE " +
    "SET state='indexing',started_at=now(),error=NULL,updated_at=now(),attempts=idx.attempts+1 " +
    "WHERE idx.business_id=$1 AND (($4 IS NULL AND idx.state IN ('ready','failed')) " +
    "OR (idx.generation=$4 AND idx.state IN ('not_started','indexing'))) RETURNING generation",
    [businessId, itemId, revision, options?.generation ?? null],
  );
  if (!started) return;
  const generation = started.generation;
  publish(businessId, { type: 'knowledge.status', knowledgeItemId: itemId, indexState: 'indexing' });

  try {
    const { chunks, rowsTruncated } = chunkKnowledge(revisionView);
    if (!chunks.length) throw new InvalidIndexDocument('empty');
    if (chunks.length > MAX_CHUNKS_PER_ITEM) throw new InvalidIndexDocument('too_large');
    const { vectors, embedModel } = await embedDocument(businessId, chunks, options?.signal);
    options?.signal?.throwIfAborted();
    const written = await withKnowledgePublication(businessId, itemId, async (tx, current) => {
      options?.signal?.throwIfAborted();
      const state = await tx.maybeOne(
        "SELECT 1 FROM knowledge_index_states WHERE business_id=$1 AND item_id=$2 AND revision=$3 AND generation=$4 AND state='indexing'",
        [businessId, itemId, revision, generation],
      );
      if (!state) return false;
      if (!eligible(current.status, current.revision)) {
        await failIndex(tx, input, 'superseded', generation);
        return false;
      }
      await tx.query('DELETE FROM knowledge_chunks WHERE business_id=$1 AND item_id=$2 AND revision=$3',
        [businessId, itemId, revision]);
      for (const [offset, chunk] of chunks.entries()) {
        options?.signal?.throwIfAborted();
        await tx.query(
          'INSERT INTO knowledge_chunks (business_id,item_id,revision,folder_id,kind,chunk_no,title,text,' +
          'term_count,lexical_terms,embedding,embed_model,embed_dim) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector,$12,$13)',
          [businessId, itemId, revision, current.folderId, chunk.kind, chunk.chunkNo, chunk.title, chunk.text,
            chunk.termCount, chunk.lexicalTerms, db.toVector(vectors[offset]), embedModel, INDEX_DIMENSIONS],
        );
      }
      await tx.query(
        "UPDATE knowledge_index_states SET state='ready',error=$4,chunk_count=$5,embed_model=$6,embed_dim=$7,indexed_at=now(),updated_at=now() " +
        'WHERE business_id=$1 AND item_id=$2 AND revision=$3',
        [businessId, itemId, revision, rowsTruncated ? 'rows_truncated' : null, chunks.length, embedModel, INDEX_DIMENSIONS],
      );
      await writeSearchability(tx, businessId, itemId, current.status === 'active' ? revision : null);
      await tx.query('DELETE FROM knowledge_chunks WHERE business_id=$1 AND item_id=$2 AND revision<$3 AND NOT searchable',
        [businessId, itemId, revision]);
      options?.signal?.throwIfAborted();
      return true;
    });
    if (written) {
      publish(businessId, { type: 'knowledge.status', knowledgeItemId: itemId, indexState: 'ready' });
      await pruneQueryCache(businessId).catch(() => undefined);
    }
  } catch (error) {
    const retryable = !(error instanceof AppError) || error.retryable;
    if (!retryable || options?.lastAttempt !== false) {
      const reason = error instanceof InvalidIndexDocument ? error.reason
        : error instanceof AppError && error.code === 'PROVIDER_BUDGET_EXHAUSTED' ? 'budget_exhausted' : 'embed_failed';
      await failIndex(db, input, reason, generation);
      publish(businessId, { type: 'knowledge.status', knowledgeItemId: itemId, indexState: 'failed' });
    }
    throw error;
  }
}

export const indexJobHandler: JobHandler<IndexPayload> = async (job) => {
  const payload = job.payload;
  if (job.businessId !== payload.businessId) {
    throw new AppError('VALIDATION_ERROR', 'Knowledge job business does not match payload');
  }
  await indexDocument(payload, { signal: job.signal, lastAttempt: job.attempt >= job.maxAttempts, generation: payload.generation });
};

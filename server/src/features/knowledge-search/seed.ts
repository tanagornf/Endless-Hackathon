import { AppError, config } from '../../core';
import type { FeatureSeed, SeedContext } from '../../core';
import { withKnowledgePublication } from '../knowledge/service';
import { indexDocument } from './index-job';
import { writeSearchability } from './indexing';
import type { IndexInput } from './indexing';
import { INDEX_DIMENSIONS } from './config';

async function checkFixture({ businessId, itemId, revision }: IndexInput, embeddingModel: string) {
  return withKnowledgePublication(businessId, itemId, async (tx, current) => {
    if (current.revision !== revision || current.status === 'draft') return 'superseded';
    const searchableRevision = current.status === 'active' ? revision : null;
    const ready = await tx.maybeOne<{ visibility_mismatch: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM knowledge_chunks c
        WHERE c.business_id=$1 AND c.item_id=$2 AND c.searchable<>COALESCE(c.revision=$6::int,false)
      ) AS visibility_mismatch
      FROM knowledge_index_states s
      CROSS JOIN LATERAL (
        SELECT count(*) AS total, count(*) FILTER (
          WHERE c.embedding IS NOT NULL AND c.embed_model=s.embed_model AND c.embed_dim=s.embed_dim
        ) AS valid
        FROM knowledge_chunks c
        WHERE c.business_id=s.business_id AND c.item_id=s.item_id AND c.revision=s.revision
      ) chunks
      WHERE s.business_id=$1 AND s.item_id=$2 AND s.revision=$3 AND s.state='ready'
        AND s.embed_model=$4 AND s.embed_dim=$5 AND s.chunk_count>0
        AND chunks.total=s.chunk_count AND chunks.valid=s.chunk_count`,
      [businessId, itemId, revision, embeddingModel, INDEX_DIMENSIONS, searchableRevision],
    );
    if (!ready) return 'needs_index';
    if (ready.visibility_mismatch) await writeSearchability(tx, businessId, itemId, searchableRevision);
    return 'ready';
  });
}

export default {
  featureId: 'F07',
  dependsOn: ['core', 'knowledge'],
  async run({ fixtures, id, log }) {
    const embeddingModel = config.MODEL_MODE === 'fake' ? 'fake-hash' : config.OPENAI_EMBED_MODEL;
    let indexed = 0;
    for (const item of fixtures.knowledge) {
      if (item.indexState !== 'ready') continue;
      const target = { businessId: id(item.businessAlias), itemId: id(item.alias), revision: item.revision };
      if (await checkFixture(target, embeddingModel) !== 'needs_index') continue;
      await indexDocument(target, { seedHistorical: true });
      const outcome = await checkFixture(target, embeddingModel);
      if (outcome === 'needs_index') {
        throw new AppError('SERVICE_NOT_READY', 'Knowledge fixture vectors are not ready');
      }
      if (outcome === 'ready') indexed++;
    }
    log('knowledge-search: indexed ' + indexed + ' seed revisions');
  },
} satisfies FeatureSeed;

export async function resetDemo({ db, id }: SeedContext): Promise<void> {
  const ids = [id('biz_demo_a'), id('biz_demo_b')];
  await db.tx(async (tx) => {
    await tx.query('DELETE FROM knowledge_fixture_requests WHERE business_id=ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM retrieval_runs WHERE business_id=ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM retrieval_cases WHERE business_id=ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM knowledge_query_cache WHERE business_id=ANY($1::uuid[])', [ids]);
  });
}

import { config } from '../../core';
import type { FeatureSeed } from '../../core';
import { indexDocument } from './index-job';
import { INDEX_DIMENSIONS } from './config';

export default {
  featureId: 'F07',
  dependsOn: ['core', 'knowledge'],
  async run({ db, fixtures, id, log }) {
    const embeddingModel = config.MODEL_MODE === 'fake' ? 'fake-hash' : config.OPENAI_EMBED_MODEL;
    let indexed = 0;
    for (const item of fixtures.knowledge) {
      if (item.indexState !== 'ready') continue;
      const businessId = id(item.businessAlias);
      const itemId = id(item.alias);
      const alreadyReady = await db.maybeOne(
        "SELECT 1 FROM knowledge_index_states WHERE business_id=$1 AND item_id=$2 AND revision=$3 AND state='ready' AND embed_model=$4 AND embed_dim=$5",
        [businessId, itemId, item.revision, embeddingModel, INDEX_DIMENSIONS],
      );
      if (alreadyReady) continue;
      await indexDocument({ businessId, itemId, revision: item.revision }, { seedHistorical: true });
      indexed++;
    }
    log('knowledge-search: indexed ' + indexed + ' seed revisions');
  },
} satisfies FeatureSeed;

import { AppError } from '../../core';
import { SEED } from '@nless/shared/core/fixtures';
const seedId = (alias: string) => [...SEED.businesses, ...SEED.knowledgeFolders].find((row) => row.alias === alias)?.id;
import type { KnowledgeSearchResult, SearchKnowledgeOptions } from '@nless/shared/features/knowledge-search/types';

/**
 * @owner F07 knowledge-search · B1 · consumers: B2 (ai-agent, voice)
 * Only items with status 'active' AND index state 'ready' of THIS business. Draft / inactive / deleted /
 * not-ready never appear. Another tenant's marker (e.g. TENANT_B_ONLY_OWL_482 searched from A) → no hits.
 * Real: model.embed({ purpose: 'query' }) + pgvector cosine over chunks embedded with the same model; optional
 * rerank = top 20 → model 'fast' strict schema { ids_ranked } (ids limited to the ones sent; failure → cosine order).
 * @fake SEED.knowledge filtered by business + active + ready. Score = |T(q) ∩ T(doc)| / |T(q)| where T = the
 *   token set of ModelApi.embed's fake tokenizer (Latin words + Thai bigrams) over title + body. Keep score ≥
 *   minScore, sort desc, take topK; snippet = first 400 chars of body; strategy 'lexical'; mode 'fake'.
 */
export async function searchKnowledge(businessId: string, query: string, opts?: SearchKnowledgeOptions): Promise<KnowledgeSearchResult> {
  const tokens = new Set((query.toLowerCase().match(/[a-z\d-]+|[\p{Script=Thai}]{2}/gu) ?? []));
  const hits = SEED.knowledge
    .filter((entry) => seedId(entry.businessAlias) === businessId && entry.status === 'active' && entry.indexState === 'ready')
    .map((entry) => {
      const doc = (entry.title + ' ' + entry.body).toLowerCase();
      const score = tokens.size ? [...tokens].filter((token) => doc.includes(token)).length / tokens.size : 0;
      return { knowledgeItemId: entry.id, title: entry.title, snippet: entry.body.slice(0, 400), score, revision: entry.revision,
        folderId: entry.folderAlias ? seedId(entry.folderAlias) ?? null : null };
    })
    .filter((hit) => hit.score >= (opts?.minScore ?? 0.1)).sort((a, b) => b.score - a.score).slice(0, opts?.topK ?? 5);
  return { query, hits, strategy: 'lexical', mode: 'fake' };
}

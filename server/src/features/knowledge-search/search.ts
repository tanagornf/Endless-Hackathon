import { z } from 'zod';
import { AppError, config, db, model } from '../../core';
import type { KnowledgeHit, KnowledgeSearchResult, SearchKnowledgeOptions } from '@nless/shared/features/knowledge-search/types';
import {
  DEFAULT_MIN_SCORE, FAKE_MIN_SCORE, INDEX_DIMENSIONS, LEX_CANDIDATES, LEXICAL_FALLBACK_MIN_SCORE,
  QUERY_MAX_CHARS, SNIPPET_MAX_CHARS, VEC_CANDIDATES,
} from './config';
import { getActiveKnowledgeItemIds } from '../knowledge/service';
import { scoreChunk } from './score';
import { termsOf, truncateAtWord } from './text';

interface Candidate {
  item_id: string;
  revision: number;
  folder_id: string | null;
  kind: 'faq' | 'article' | 'row';
  chunk_no: number;
  title: string;
  text: string;
  lexical_terms: string[];
  cos: number | null;
  population: number;
  document_frequency: Record<string, number>;
}

async function queryVector(businessId: string, query: string): Promise<{ values: number[]; model: string } | null> {
  if (config.MODEL_MODE === 'fake') return null;
  try {
    const result = await model.embed({ usage: { featureId: 'F07', purpose: 'embed-query', businessId }, texts: [query], purpose: 'query' });
    const vector = result.vectors[0];
    return result.mode === 'openai' && result.dim === INDEX_DIMENSIONS && vector?.length === INDEX_DIMENSIONS &&
      vector.every((value) => Number.isFinite(value)) ? { values: vector, model: result.model } : null;
  } catch (error) {
    if (error instanceof AppError && (error.code.startsWith('PROVIDER_') || error.code === 'RATE_LIMITED')) return null;
    throw error;
  }
}

async function candidates(businessId: string, allTerms: string[], folders: string[] | null,
  vector: { values: number[]; model: string } | null): Promise<Candidate[]> {
  return db.tx(async (tx) => {
    if (vector) await tx.query('SET LOCAL hnsw.ef_search = 100');
    const { rows } = await tx.query<Candidate>(
      'WITH lexical AS (' +
        'SELECT c.id FROM knowledge_chunks c WHERE c.business_id=$1 AND c.searchable AND c.lexical_terms && $2::text[] ' +
        'AND ($3::uuid[] IS NULL OR c.folder_id=ANY($3)) ORDER BY ' +
        '(SELECT count(*) FROM unnest(c.lexical_terms) t WHERE t=ANY($2)) DESC,c.chunk_no,c.id LIMIT $6' +
      '), semantic AS (' +
        'SELECT c.id FROM knowledge_chunks c WHERE c.business_id=$1 AND c.searchable AND c.embedding IS NOT NULL ' +
        'AND c.embed_model=$5 AND c.embed_dim=$8 AND $4::vector IS NOT NULL AND ($3::uuid[] IS NULL OR c.folder_id=ANY($3)) ' +
        'ORDER BY c.embedding <=> $4::vector LIMIT $7' +
      '), sample AS (' +
        'SELECT lexical_terms FROM knowledge_chunks WHERE business_id=$1 AND searchable ORDER BY created_at DESC,id LIMIT 5000' +
      '), terms AS (' +
        'SELECT t,count(*)::int AS occurrences FROM sample CROSS JOIN LATERAL unnest(lexical_terms) t WHERE t=ANY($2) GROUP BY t' +
      ') SELECT c.item_id,c.revision,c.folder_id,c.kind,c.chunk_no,c.title,c.text,c.lexical_terms,' +
        'CASE WHEN c.embed_model=$5 AND c.embed_dim=$8 THEN 1-(c.embedding <=> $4::vector) END AS cos,' +
        '(SELECT count(*)::int FROM sample) AS population, ' +
        "(SELECT COALESCE(jsonb_object_agg(t,occurrences),'{}'::jsonb) FROM terms) AS document_frequency " +
      'FROM knowledge_chunks c WHERE c.business_id=$1 AND c.searchable AND c.id IN (SELECT id FROM lexical UNION SELECT id FROM semantic)',
      [businessId, allTerms, folders, vector ? db.toVector(vector.values) : null, vector?.model ?? null,
        LEX_CANDIDATES, VEC_CANDIDATES, INDEX_DIMENSIONS],
    );
    const active = await getActiveKnowledgeItemIds(businessId, [...new Set(rows.map((row) => row.item_id))], tx);
    return rows.filter((row) => active.has(row.item_id));
  });
}

function resultHit(chunk: Candidate, score: number): KnowledgeHit {
  const prefix = chunk.title + '\n';
  const text = chunk.kind === 'article' && chunk.text.startsWith(prefix) ? chunk.text.slice(prefix.length) : chunk.text;
  return {
    knowledgeItemId: chunk.item_id, revision: chunk.revision, title: chunk.title,
    snippet: truncateAtWord(text, SNIPPET_MAX_CHARS), score: Math.round(score * 1000) / 1000, folderId: chunk.folder_id,
  };
}

const folderFilter = z.array(z.string().uuid()).max(20);

export async function searchKnowledge(businessId: string, query: string, opts?: SearchKnowledgeOptions): Promise<KnowledgeSearchResult> {
  const text = query.trim().slice(0, QUERY_MAX_CHARS);
  const mode = config.MODEL_MODE === 'fake' ? 'fake' : 'real';
  if (!text) return { query: text, strategy: 'lexical', mode, hits: [] };
  const topK = Number.isFinite(opts?.topK) ? Math.min(20, Math.max(0, Math.floor(opts!.topK!))) : 5;
  const rawFolders = opts?.folderIds;
  const folders = folderFilter.safeParse(rawFolders ?? []);
  if (!folders.success) throw new AppError('VALIDATION_ERROR', 'Invalid knowledge folder filter');
  const terms = termsOf(text);
  const allTerms = [...terms.words, ...terms.skus];
  const markers = terms.skus.filter((sku) => /^tenant_[a-z]+_only_[a-z]+_\d+$/.test(sku));
  try {
    const vector = await queryVector(businessId, text);
    const rows = await candidates(businessId, allTerms, folders.data.length ? folders.data : null, vector);
    const strategy = rows.some((chunk) => chunk.cos !== null) ? 'hybrid' : 'lexical';
    const minimum = opts?.minScore ?? (strategy === 'hybrid' ? DEFAULT_MIN_SCORE :
      mode === 'fake' ? FAKE_MIN_SCORE : LEXICAL_FALLBACK_MIN_SCORE);
    const ranked = rows
      .filter((chunk) => markers.every((marker) => chunk.lexical_terms.includes(marker)))
      .map((chunk) => ({ chunk, score: scoreChunk(text, terms, chunk, strategy).final }))
      .filter(({ score }) => score >= minimum && score > 0)
      .sort((a, b) => b.score - a.score || b.chunk.revision - a.chunk.revision ||
        a.chunk.item_id.localeCompare(b.chunk.item_id) || a.chunk.chunk_no - b.chunk.chunk_no);
    const found = new Set<string>();
    const hits: KnowledgeHit[] = [];
    for (const { chunk, score } of ranked) {
      if (hits.length >= topK) break;
      if (found.has(chunk.item_id)) continue;
      found.add(chunk.item_id);
      hits.push(resultHit(chunk, score));
    }
    return { query: text, strategy, mode, hits };
  } catch (cause) {
    throw new AppError('INTERNAL', 'Knowledge search failed', { cause });
  }
}

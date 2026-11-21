import { z } from 'zod';
import { AppError, config, db, model } from '../../core';
import type {
  KnowledgeHit, KnowledgeSearchResult, RetrievalConfig, RetrievalStrategy, SearchKnowledgeOptions,
  WorkbenchHit, WorkbenchSearchOptions, WorkbenchSearchResult,
} from '@nless/shared/features/knowledge-search/types';
import {
  C0, C0_XLANG, C1, DEFAULT_MIN_SCORE, FAKE_MIN_SCORE, INDEX_DIMENSIONS, LEX_CANDIDATES, LEXICAL_FALLBACK_MIN_SCORE,
  QUERY_MAX_CHARS, SNIPPET_MAX_CHARS, VEC_CANDIDATES, W_LEX, W_VEC, W_XLANG,
} from './config';
import { getActiveKnowledgeItemIds, getActiveWebKnowledgeCitations, readWebKnowledgeAnswer } from '../knowledge/service';
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
  semantic_match: boolean;
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
      'c.id IN (SELECT id FROM semantic) AS semantic_match,' +
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

export function retrievalSettings(strategy: RetrievalStrategy, options?: WorkbenchSearchOptions): RetrievalConfig {
  const weights = options?.weights;
  return {
    strategy, wVec: weights?.vec ?? W_VEC, wLex: weights?.lex ?? W_LEX, wXlang: W_XLANG,
    c0Xlang: Math.min(C0_XLANG, weights?.c0 ?? C0), c0: weights?.c0 ?? C0, c1: weights?.c1 ?? C1, rerank: false,
    minScore: options?.minScore ?? (strategy !== 'lexical' ? DEFAULT_MIN_SCORE
      : config.MODEL_MODE === 'fake' ? FAKE_MIN_SCORE : LEXICAL_FALLBACK_MIN_SCORE),
    embedModel: config.MODEL_MODE === 'fake' ? 'fake-hash' : config.OPENAI_EMBED_MODEL,
  };
}

export async function searchWorkbench(businessId: string, query: string, opts?: WorkbenchSearchOptions): Promise<WorkbenchSearchResult> {
  const start = performance.now();
  const text = query.trim().slice(0, QUERY_MAX_CHARS);
  const mode = config.MODEL_MODE === 'fake' ? 'fake' : 'real';
  if (!text) return {
    query: text, strategy: 'lexical', mode, hits: [], config: retrievalSettings('lexical', opts), belowThreshold: [],
    timings: { embedMs: 0, sqlMs: 0, rerankMs: null, totalMs: 0 }, cacheHit: false,
  };
  const topK = Number.isFinite(opts?.topK) ? Math.min(20, Math.max(0, Math.floor(opts!.topK!))) : 5;
  const rawFolders = opts?.folderIds;
  const folders = folderFilter.safeParse(rawFolders ?? []);
  if (!folders.success) throw new AppError('VALIDATION_ERROR', 'Invalid knowledge folder filter');
  const terms = termsOf(text);
  const allTerms = [...terms.words, ...terms.skus];
  const markers = terms.skus.filter((sku) => /^tenant_[a-z]+_only_[a-z]+_\d+$/.test(sku));
  try {
    const embedStart = performance.now();
    const vector = opts?.strategy === 'lexical' ? null : await queryVector(businessId, text);
    const sqlStart = performance.now();
    const rows = await candidates(businessId, allTerms, folders.data.length ? folders.data : null, vector);
    const sqlMs = Math.round(performance.now() - sqlStart);
    const strategy = rows.some((chunk) => chunk.cos !== null)
      ? opts?.strategy === 'vector' ? 'vector' : 'hybrid'
      : 'lexical';
    const settings = retrievalSettings(strategy, opts);
    const ranked = rows
      .filter((chunk) => (strategy !== 'vector' || chunk.semantic_match) &&
        markers.every((marker) => chunk.lexical_terms.includes(marker)))
      .map((chunk) => ({ chunk, score: scoreChunk(text, terms, chunk, strategy, opts?.weights) }))
      .sort((a, b) => b.score.final - a.score.final || b.chunk.revision - a.chunk.revision ||
        a.chunk.item_id.localeCompare(b.chunk.item_id) || a.chunk.chunk_no - b.chunk.chunk_no);
    const found = new Set<string>();
    const hits: WorkbenchHit[] = [];
    const belowThreshold: WorkbenchSearchResult['belowThreshold'] = [];
    for (const { chunk, score } of ranked) {
      if (found.has(chunk.item_id)) continue;
      found.add(chunk.item_id);
      if (score.final >= settings.minScore && score.final > 0) {
        if (hits.length < topK) hits.push({
          ...resultHit(chunk, score.final), status: 'active', chunkText: chunk.text,
          debug: { ...score, chunkNo: chunk.chunk_no, cos: chunk.cos },
        });
      } else if (belowThreshold.length < 3) {
        belowThreshold.push({ knowledgeItemId: chunk.item_id, title: chunk.title, final: score.final });
      }
    }
    return {
      query: text, strategy, mode, hits, config: settings, belowThreshold, cacheHit: false,
      timings: { embedMs: Math.round(sqlStart - embedStart), sqlMs, rerankMs: null, totalMs: Math.round(performance.now() - start) },
    };
  } catch (cause) {
    throw new AppError('INTERNAL', 'Knowledge search failed', { cause });
  }
}

async function exactWebHit(businessId: string, question: string, folders: string[]): Promise<KnowledgeHit | null> {
  const approved = await readWebKnowledgeAnswer(businessId, question);
  if (!approved || (folders.length && (!approved.folderId || !folders.includes(approved.folderId)))) return null;
  return {
    knowledgeItemId: approved.itemId, revision: approved.revision, title: approved.title, folderId: approved.folderId,
    snippet: truncateAtWord(approved.answer, SNIPPET_MAX_CHARS), score: 1, citations: approved.citations,
  };
}

export async function searchKnowledge(businessId: string, query: string, opts?: SearchKnowledgeOptions): Promise<KnowledgeSearchResult> {
  const folders = folderFilter.safeParse(opts?.folderIds ?? []);
  if (folders.success && !(Number.isFinite(opts?.topK) && opts!.topK! < 1) && (opts?.minScore ?? 0) <= 1) {
    // The approved FAQ may have an edited title. Match its immutable public question first.
    const exact = await exactWebHit(businessId, query, folders.data);
    if (exact) return { query: query.trim(), strategy: 'lexical', mode: config.MODEL_MODE === 'fake' ? 'fake' : 'real', hits: [exact] };
  }
  const result = await searchWorkbench(businessId, query, opts);
  const sources = await getActiveWebKnowledgeCitations(businessId, result.hits.map((hit) => hit.knowledgeItemId));
  return {
    query: result.query, strategy: result.strategy, mode: result.mode,
    hits: result.hits.map(({ debug: _debug, chunkText: _chunkText, status: _status, ...hit }) => {
      const citations = sources.get(hit.knowledgeItemId);
      return citations ? { ...hit, citations } : hit;
    }),
  };
}

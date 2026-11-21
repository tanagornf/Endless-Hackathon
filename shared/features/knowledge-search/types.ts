import type { WebKnowledgeCitation } from '../knowledge/types';

export interface KnowledgeHit {
  knowledgeItemId: string;
  revision: number;
  title: string;
  /** ≤ 400 chars of the matched chunk. Data for the model, not instructions. */
  snippet: string;
  /** 0..1, higher is better. Not a correctness guarantee. */
  score: number;
  folderId: string | null;
  /** Public source links retained when a web FAQ is approved by the shop. */
  citations?: WebKnowledgeCitation[];
}

export interface KnowledgeSearchResult {
  query: string;
  strategy: 'lexical' | 'vector' | 'hybrid';
  hits: KnowledgeHit[];
  mode: 'real' | 'fake';
}

export interface SearchKnowledgeOptions {
  /** Default 5, max 20. */
  topK?: number;
  /**
   * Default 0.1 (fake/lexical). B1 re-tunes it on the SPEC §5 fixtures for text-embedding-3-large @ 1536
   * (do not copy Papi's thresholds: they were tuned for other embedding models).
   */
  minScore?: number;
  folderIds?: string[];
}

export type RetrievalStrategy = KnowledgeSearchResult['strategy'];
export interface RetrievalWeights { vec: number; lex: number; c0: number; c1: number }

export interface WorkbenchSearchOptions extends SearchKnowledgeOptions {
  strategy?: 'auto' | RetrievalStrategy;
  weights?: RetrievalWeights;
}

export interface HitDebug {
  chunkNo: number; cos: number | null; vecNorm: number | null; lex: number;
  matchedTerms: string[]; skuHit: boolean; crossScript: boolean; final: number;
}

export interface WorkbenchHit extends KnowledgeHit { debug: HitDebug; chunkText: string; status: 'active' }
export interface RetrievalConfig {
  strategy: RetrievalStrategy; wVec: number; wLex: number; wXlang: number; c0Xlang: number;
  c0: number; c1: number; minScore: number; rerank: boolean; embedModel: string;
}

export interface WorkbenchSearchResult extends KnowledgeSearchResult {
  hits: WorkbenchHit[];
  config: RetrievalConfig;
  belowThreshold: { knowledgeItemId: string; title: string; final: number }[];
  timings: { embedMs: number; sqlMs: number; rerankMs: number | null; totalMs: number };
  cacheHit: boolean;
}

export interface IndexStatus {
  mode: KnowledgeSearchResult['mode']; embedModel: string; embedDim: number;
  counts: { not_started: number; indexing: number; ready: number; failed: number };
  searchableItems: number; chunkCount: number; staleModelChunks: number; lastIndexedAt: string | null;
}

export interface SourceView {
  knowledgeItemId: string; revision: number; title: string; body: string; status: string;
  isCurrent: boolean; chunks: { chunkNo: number; text: string }[];
}

export type RetrievalGroup = 'th' | 'en' | 'xlang';
export interface RetrievalGroupMetrics {
  positives: number; recallAt1: number; recallAt3: number; recallAt5: number; nonePassRate: number | null;
}
export interface RetrievalMetrics extends RetrievalGroupMetrics {
  cases: number; mrr: number; forbidPassRate: number | null; byGroup: Record<RetrievalGroup, RetrievalGroupMetrics>;
}
export interface RetrievalCaseResult {
  id: string; query: string; source: 'fixture' | 'saved'; group: RetrievalGroup;
  kind: 'positive' | 'none' | 'forbid'; pass: boolean; rank: number | null; topTitle: string | null; topScore: number | null;
  strategy?: RetrievalStrategy;
}
export interface RetrievalCoverage {
  fixtureCasesPlanned: number;
  fixtureCasesEvaluated: number;
  savedCasesEvaluated: number;
  unresolvedForbiddenCases: number;
}
export interface RetrievalRunSummary {
  id: string; createdAt: string; metrics: RetrievalMetrics; config: RetrievalConfig;
  coverage: RetrievalCoverage | null;
  strategyCounts: Record<RetrievalStrategy, number> | null;
}
export interface RetrievalRunResult extends RetrievalRunSummary {
  perCase: RetrievalCaseResult[]; previous: RetrievalMetrics | null;
  comparison: 'first' | 'comparable' | 'different_scope' | 'unknown' | 'scope_changed';
}
export interface RetrievalCaseRow {
  id: string; query: string; expectItemIds: string[]; expectTitles: string[]; expectNone: boolean; createdAt: string;
}


export function evidenceIdOf(hit: { knowledgeItemId: string; revision: number }): string {
  return 'knowledge:' + hit.knowledgeItemId + ':r' + hit.revision;
}

export function parseEvidenceId(value: string): { knowledgeItemId: string; revision: number } | null {
  const match = /^knowledge:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):r([1-9]\d*)$/.exec(value);
  if (!match) return null;
  const revision = Number(match[2]);
  return Number.isSafeInteger(revision) ? { knowledgeItemId: match[1], revision } : null;
}

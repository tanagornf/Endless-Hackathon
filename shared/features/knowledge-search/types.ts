export interface KnowledgeHit {
  knowledgeItemId: string;
  revision: number;
  title: string;
  /** ≤ 400 chars of the matched chunk. Data for the model, not instructions. */
  snippet: string;
  /** 0..1, higher is better. Not a correctness guarantee. */
  score: number;
  folderId: string | null;
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


export function evidenceIdOf(hit: { knowledgeItemId: string; revision: number }): string {
  return 'knowledge:' + hit.knowledgeItemId + ':r' + hit.revision;
}

export function parseEvidenceId(value: string): { knowledgeItemId: string; revision: number } | null {
  const match = /^knowledge:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):r([1-9]\d*)$/.exec(value);
  if (!match) return null;
  const revision = Number(match[2]);
  return Number.isSafeInteger(revision) ? { knowledgeItemId: match[1], revision } : null;
}

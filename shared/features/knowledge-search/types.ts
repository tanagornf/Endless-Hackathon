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

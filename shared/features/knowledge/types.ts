export interface KnowledgeDraftInput {
  businessId: string;
  kind?: 'faq' | 'article';
  /** ≤ 255 chars (longer → VALIDATION_ERROR). */
  title: string;
  /** ≤ 20,000 chars. */
  body: string;
  folderId?: string | null;
  /** Import job id (F06) kept on the row for traceability. */
  sourceRef: string;
  /** Same (businessId, clientRequestId) twice → the existing item, created: false. Use `<importId>:<rowNo>`. */
  clientRequestId: string;
  /** null = system. */
  actorUserId: string | null;
}

export interface KnowledgeDraftResult {
  itemId: string;
  revision: number;
  created: boolean;
  warnings: { code: 'duplicate_title' | 'duplicate_content'; itemId: string }[];
}

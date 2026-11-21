import type { KnowledgeIndexState, KnowledgeStatus } from '../../core/types';

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

export interface OwnerConsultKnowledgeDraftInput {
  businessId: string;
  caseId: string;
  actionStepId: string;
  answerReceiptId: string;
  /** Generalized material prepared for owner review, with no private case transcript. */
  title: string;
  body: string;
}

export interface WebKnowledgeCitation {
  url: string;
  title: string;
}

export interface WebKnowledgeSuggestion {
  /** The public question accepted from the worker, independent of later title edits. */
  question: string;
  citations: WebKnowledgeCitation[];
}

export interface WebKnowledgeDraftInput extends WebKnowledgeSuggestion {
  /** Verified tenant of the background job. */
  businessId: string;
  answer: string;
}

export interface WebKnowledgeDraftMatch {
  itemId: string;
  status: KnowledgeStatus;
}

export interface ApprovedWebKnowledgeAnswer {
  itemId: string;
  revision: number;
  title: string;
  folderId: string | null;
  answer: string;
  citations: WebKnowledgeCitation[];
}

export interface KnowledgeFileTag {
  fileId: string;
  description: string;
  sendToUser: boolean;
  flagged: boolean;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}
export interface KnowledgeModeration {
  status: 'ok' | 'flagged' | 'unchecked';
  categories: string[];
  revision: number;
  checkedAt: string;
}
export interface KnowledgeIndexView {
  state: KnowledgeIndexState;
  revision: number;
  error: string | null;
  indexedAt: string | null;
}
export interface KnowledgeItemRow {
  id: string;
  kind: 'faq' | 'article';
  title: string;
  snippet: string;
  status: KnowledgeStatus;
  revision: number;
  folderId: string | null;
  folderName: string | null;
  indexState: KnowledgeIndexState;
  updatedAt: string;
  source: 'manual' | 'import' | 'seed' | 'fixture' | 'web' | 'owner-consult';
}
export interface KnowledgeItemDetail extends Omit<KnowledgeItemRow, 'snippet'> {
  body: string;
  webSuggestion: WebKnowledgeSuggestion | null;
  files: KnowledgeFileTag[];
  moderation: KnowledgeModeration | null;
  index: KnowledgeIndexView;
  mutable: boolean;
  warnings: { code: 'duplicate_title' | 'duplicate_content'; itemId: string; title: string }[];
  createdAt: string;
  submittedAt: string | null;
  activatedAt: string | null;
  deletedAt: string | null;
}
export interface KnowledgeRevisionRow {
  revision: number;
  title: string;
  createdAt: string;
  createdByName: string | null;
  isCurrent: boolean;
}
export interface KnowledgeRevisionDetail extends KnowledgeRevisionRow {
  kind: 'faq' | 'article';
  body: string;
  folderId: string | null;
}
export interface KnowledgeFolderRow {
  id: string;
  name: string;
  itemCount: number;
  createdAt: string;
}

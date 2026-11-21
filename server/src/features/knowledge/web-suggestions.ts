import { z } from 'zod';
import { AppError, db } from '../../core';
import type {
  ApprovedWebKnowledgeAnswer, KnowledgeDraftResult, WebKnowledgeCitation, WebKnowledgeDraftInput,
  WebKnowledgeDraftMatch, WebKnowledgeSuggestion,
} from '@nless/shared/features/knowledge/types';
import { storeKnowledgeDraft } from './drafts';
import { contentHash, normalizeContent } from './hash';

const Question = z.string().transform((text) => normalizeContent(text).replace(/\s+/gu, ' ')).pipe(
  z.string().min(1).max(255).refine((text) => /[\p{L}\p{N}]/u.test(text) &&
    !/[\p{Cc}\p{Cf}@]|\b(?:https?:\/\/|www\.)/iu.test(text) &&
    !/(?:\p{Nd}[\s().+\-]*){9}/u.test(text)),
);

const Citation = z.object({
  url: z.string().trim().max(2_048).pipe(z.url()).refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password;
  }),
  title: z.string().trim().min(1).max(300).refine((title) => !/[\p{Cc}\u202a-\u202e\u2066-\u2069]/u.test(title)),
}).strict();

const Suggestion = z.object({
  businessId: z.uuid(),
  question: Question,
  answer: z.string().trim().min(1).max(20_000).refine((text) => !text.includes('\0')),
  citations: z.array(Citation).min(1).max(12),
}).strict();

function requestId(question: string): string {
  const key = question.toLowerCase().replace(/[?!。！]+$/u, '').trimEnd();
  return 'web-question:' + contentHash(key, '');
}

function questionRequestId(question: string): string | null {
  const parsed = Question.safeParse(question);
  return parsed.success ? requestId(parsed.data) : null;
}

/** Receives public, sanitized text from the trusted web worker. It never schedules indexing. */
export async function createWebKnowledgeDraft(input: WebKnowledgeDraftInput): Promise<KnowledgeDraftResult> {
  const parsed = Suggestion.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid web knowledge suggestion');
  const { businessId, question, answer, citations } = parsed.data;
  const sources = [...new Map(citations.map((citation) => [citation.url, citation])).values()];
  return storeKnowledgeDraft({
    businessId, kind: 'faq', title: question, body: answer, sourceRef: 'web-search',
    clientRequestId: requestId(question), actorUserId: null,
  }, { question, citations: sources });
}

/** Includes rejected (deleted) items so a repeat cannot recreate an owner's rejected suggestion. */
export async function findWebKnowledgeDraft(businessId: string, question: string): Promise<WebKnowledgeDraftMatch | null> {
  const key = questionRequestId(question);
  if (!key) return null;
  return db.maybeOne<WebKnowledgeDraftMatch>(
    "SELECT id AS \"itemId\",status FROM knowledge_items WHERE business_id=$1 AND client_request_id=$2 AND source='web'",
    [businessId, key],
  );
}

/** Exact repeat lookup independent of F07 indexing or the web provider. */
export async function readWebKnowledgeAnswer(businessId: string, question: string): Promise<ApprovedWebKnowledgeAnswer | null> {
  const key = questionRequestId(question);
  if (!key) return null;
  return db.maybeOne<ApprovedWebKnowledgeAnswer>(
    `SELECT id AS "itemId",revision,title,folder_id AS "folderId",body AS answer,web_suggestion->'citations' AS citations ` +
    "FROM knowledge_items WHERE business_id=$1 AND client_request_id=$2 AND source='web' AND status='active'",
    [businessId, key],
  );
}

/** Only active items contribute sources to buyer retrieval. */
export async function getActiveWebKnowledgeCitations(
  businessId: string, itemIds: string[],
): Promise<Map<string, WebKnowledgeCitation[]>> {
  if (!itemIds.length) return new Map();
  const { rows } = await db.query<{ id: string; web_suggestion: WebKnowledgeSuggestion }>(
    "SELECT id,web_suggestion FROM knowledge_items WHERE business_id=$1 AND id=ANY($2::uuid[]) AND source='web' AND status='active'",
    [businessId, itemIds],
  );
  return new Map(rows.map((row) => [row.id, row.web_suggestion.citations]));
}

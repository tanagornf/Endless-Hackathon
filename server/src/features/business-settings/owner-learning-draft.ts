import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OwnerConsultKnowledgeDraftInput, KnowledgeDraftResult } from '@nless/shared/features/knowledge/types';
import { AppError, db, redactText } from '../../core';
import type { ModelChatInput, UsageAttribution } from '../../core';
import { createOwnerConsultKnowledgeDraft, getKnowledgeRevision } from '../knowledge/service';

const purpose = 'learning.owner-correction';
const textLimit = 3000;
// This flow creates a new FAQ draft and has no existing knowledge target to revise.
const candidateActions = ['knowledge_add', 'no_change'] as const;
const keySchema = z.object({
  businessId: z.uuid(),
  caseId: z.uuid(),
  actionStepId: z.string().min(1).max(80).regex(/^[A-Za-z0-9_-]+$/),
  answerReceiptId: z.uuid(),
  expectedVersion: z.int().min(1),
}).strict();

export type OwnerLearningDraftInput = z.infer<typeof keySchema>;
export interface OwnerLearningDraftReceipt {
  businessId: string;
  caseId: string;
  actionStepId: string;
  answerReceiptId: string;
  version: number;
  state: 'pending' | 'answered';
  reuse: 'case_only' | 'propose_draft' | null;
  actorUserId: string;
  question: string;
  answer: string;
  language: 'th' | 'en';
}

export interface OwnerLearningAnalysisInput {
  usage: UsageAttribution & { featureId: 'F04'; businessId: string };
  redactedInput: string;
  responseFormat: NonNullable<ModelChatInput['responseFormat']>;
  signal?: AbortSignal;
}

export interface OwnerLearningDraftPorts {
  /** The C1 adapter returns the decoded JSON candidate. */
  analyze(input: OwnerLearningAnalysisInput): Promise<unknown>;
  signal?: AbortSignal;
  readReceipt?(key: OwnerLearningDraftInput): Promise<OwnerLearningDraftReceipt | null>;
  createDraft?(input: OwnerConsultKnowledgeDraftInput): Promise<KnowledgeDraftResult | null>;
  readDraftRevision?(businessId: string, itemId: string, revision: number): Promise<{ title: string; body: string } | null>;
}

type SkipReason = 'receipt_unavailable' | 'case_only' | 'stale_version' | 'invalid_candidate' | 'no_change';
export type OwnerLearningDraftResult =
  | { kind: 'skipped'; reason: SkipReason }
  | ({ kind: 'draft'; candidateDigest: string } & KnowledgeDraftResult);

const candidateSchema = z.object({
  action: z.enum(candidateActions),
  caseId: z.uuid(),
  targetId: z.null(),
  expectedVersion: z.int().min(1),
  textTh: z.string().trim().min(1).max(textLimit).nullable(),
  textEn: z.string().trim().min(1).max(textLimit).nullable(),
  reason: z.string().trim().min(1).max(500),
}).strict();

function localizedDraftFormat(language: string) {
  return {
    type: ['string', 'null'],
    description: language + ' reusable shop FAQ. Write a short topic heading on line one, then a standalone answer on the next line. Generalize both independently. Omit names, references to this buyer, contact or order details and one-time exceptions. If no reusable shop fact is supported, choose no_change.',
  };
}

function splitDraft(text: string | null) {
  if (!text || /\[(?:redacted[^\]]*|link|phone|line-id|order-ref|email)\]/iu.test(text)) return null;
  const [heading, ...lines] = text.split(/\r?\n/u);
  const title = heading.trim();
  const body = lines.join('\n').trim();
  if (!title || title.length > 120 || !body || ![title, ...lines].every(candidateTextIsSafe)) return null;
  return { title, body };
}

function responseFormat(key: OwnerLearningDraftInput): OwnerLearningAnalysisInput['responseFormat'] {
  const properties = {
    action: { type: 'string', enum: candidateActions },
    caseId: { type: 'string', enum: [key.caseId] },
    targetId: { type: 'null' },
    expectedVersion: { type: 'integer', enum: [key.expectedVersion] },
    textTh: localizedDraftFormat('Thai'),
    textEn: localizedDraftFormat('English'),
    reason: { type: 'string' },
  };
  return {
    name: 'owner_learning_draft',
    strict: true,
    schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false },
  };
}

function readAuthoritativeReceipt(key: OwnerLearningDraftInput): Promise<OwnerLearningDraftReceipt | null> {
  return db.maybeOne<OwnerLearningDraftReceipt>(
    `SELECT s.business_id AS "businessId", s.case_id AS "caseId", s.action_step_id AS "actionStepId",
            s.answer_receipt_id AS "answerReceiptId", s.answered_by AS "actorUserId", s.version, s.state,
            s.reuse, c.language, s.question, s.answer
     FROM owner_consult_steps s
     JOIN owner_consult_cases c ON (c.business_id,c.id) = (s.business_id,s.case_id)
     JOIN businesses b ON b.id = s.business_id AND b.status = 'active'
     JOIN accounts a ON a.id = b.account_id AND a.status = 'active'
     JOIN memberships m ON m.business_id = s.business_id AND m.user_id = s.answered_by
                       AND m.role = 'owner' AND m.status = 'active'
     JOIN users u ON u.id = m.user_id AND u.status = 'active'
     WHERE s.business_id = $1 AND s.case_id = $2 AND s.action_step_id = $3
       AND s.answer_receipt_id = $4 AND s.state = 'answered' AND s.customer_ready_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM owner_consult_steps newer
         WHERE (newer.business_id,newer.case_id) = (s.business_id,s.case_id)
           AND (newer.created_at,newer.action_step_id) > (s.created_at,s.action_step_id)
       )`,
    [key.businessId, key.caseId, key.actionStepId, key.answerReceiptId],
  );
}

function blockedReceipt(receipt: OwnerLearningDraftReceipt, key: OwnerLearningDraftInput): SkipReason | undefined {
  if (receipt.businessId !== key.businessId || receipt.caseId !== key.caseId ||
      receipt.actionStepId !== key.actionStepId || receipt.answerReceiptId !== key.answerReceiptId ||
      receipt.state !== 'answered' || !z.uuid().safeParse(receipt.actorUserId).success ||
      (receipt.language !== 'en' && receipt.language !== 'th') ||
      typeof receipt.question !== 'string' || typeof receipt.answer !== 'string') return 'receipt_unavailable';
  if (receipt.version !== key.expectedVersion) return 'stale_version';
  if (receipt.reuse !== 'propose_draft') return 'case_only';
  return undefined;
}

function scrub(text: string, limit: number): string {
  const normalized = text.normalize('NFKC')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, '')
    .replace(/\b(?:[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}|NL-\d{2}[A-Z]{3}\d{2}-[A-Z0-9]{4}-[A-Z0-9]{4})\b/giu, '[order-ref]')
    .replace(/https?:\/\/[^\s<>"']+/giu, '[link]')
    .replace(/\b[UCR][0-9a-f]{32}\b/giu, '[line-id]')
    .replace(/(?<![\p{L}\d])(?:\+66|0066)(?:[ .()-]*\d){8,9}(?!\d)/gu, '[phone]');
  return redactText(normalized, limit).trim();
}

function candidateTextIsSafe(text: string): boolean {
  return scrub(text, textLimit) === text.normalize('NFKC').trim();
}

/** Digest of the exact title and body of the saved revision. Publication requires separate owner approval. */
export function digestOwnerLearningDraft(input: { title: string; body: string }): string {
  return createHash('sha256').update(JSON.stringify({ title: input.title, body: input.body })).digest('hex');
}

function skipped(reason: SkipReason): OwnerLearningDraftResult {
  return { kind: 'skipped', reason };
}

export async function prepareOwnerLearningDraft(
  input: OwnerLearningDraftInput,
  ports: OwnerLearningDraftPorts,
): Promise<OwnerLearningDraftResult> {
  const key = keySchema.safeParse(input);
  if (!key.success) throw new AppError('VALIDATION_ERROR', 'Invalid owner learning draft scope');
  const { businessId, caseId, actionStepId, answerReceiptId, expectedVersion } = key.data;
  const { signal } = ports;
  const readReceipt = ports.readReceipt ?? readAuthoritativeReceipt;
  const createDraft = ports.createDraft ?? createOwnerConsultKnowledgeDraft;
  signal?.throwIfAborted();
  const receipt = await readReceipt(key.data);
  if (!receipt) return skipped('receipt_unavailable');
  const blocked = blockedReceipt(receipt, key.data);
  if (blocked) return skipped(blocked);

  const question = scrub(receipt.question, 1200);
  const ownerAnswer = scrub(receipt.answer, 2000);
  if (!question || !ownerAnswer) return skipped('no_change');
  signal?.throwIfAborted();
  const candidate = candidateSchema.safeParse(await ports.analyze({
    usage: { featureId: 'F04', businessId, purpose },
    redactedInput: JSON.stringify({ caseId, targetId: null, expectedVersion, sourceLanguage: receipt.language, question, ownerAnswer }),
    responseFormat: responseFormat(key.data),
    signal,
  }));
  signal?.throwIfAborted();
  if (!candidate.success || candidate.data.caseId !== caseId || candidate.data.expectedVersion !== expectedVersion) {
    return skipped('invalid_candidate');
  }
  const { action, textTh, textEn } = candidate.data;
  if (action === 'no_change') return skipped(textTh === null && textEn === null ? 'no_change' : 'invalid_candidate');

  const th = splitDraft(textTh);
  const en = splitDraft(textEn);
  if (!th || !en || ![th.title, th.body].every(value => /\p{Script=Thai}/u.test(value)) ||
      ![en.title, en.body].every(value => /[a-z]/i.test(value) && !/\p{Script=Thai}/u.test(value))) {
    return skipped('invalid_candidate');
  }

  const current = await readReceipt(key.data);
  if (!current) return skipped('receipt_unavailable');
  const currentBlocked = blockedReceipt(current, key.data);
  if (currentBlocked) return skipped(currentBlocked);
  if (current.answer !== receipt.answer || current.question !== receipt.question ||
      current.actorUserId !== receipt.actorUserId || current.language !== receipt.language) return skipped('stale_version');

  signal?.throwIfAborted();
  const item = await createDraft({
    businessId, caseId, actionStepId, answerReceiptId,
    title: th.title + ' / ' + en.title,
    body: 'ไทย\n' + th.body + '\n\nEnglish\n' + en.body,
  });
  if (!item) return skipped('receipt_unavailable');
  const saved = await (ports.readDraftRevision ?? getKnowledgeRevision)(businessId, item.itemId, item.revision);
  if (!saved) throw new AppError('SERVICE_NOT_READY', 'Owner draft revision unavailable', { retryable: true });
  return { kind: 'draft', ...item, candidateDigest: digestOwnerLearningDraft(saved) };
}

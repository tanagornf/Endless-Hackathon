import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { KnowledgeDraftInput, KnowledgeDraftResult } from '@nless/shared/features/knowledge/types';
import { AppError, db, redactText } from '../../core';
import type { ModelChatInput, UsageAttribution } from '../../core';
import { createKnowledgeDraft, getKnowledgeRevision } from '../knowledge/service';

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
  createDraft?(input: KnowledgeDraftInput): Promise<KnowledgeDraftResult>;
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

function responseFormat(key: OwnerLearningDraftInput): OwnerLearningAnalysisInput['responseFormat'] {
  const properties = {
    action: { type: 'string', enum: candidateActions },
    caseId: { type: 'string', enum: [key.caseId] },
    targetId: { type: 'null' },
    expectedVersion: { type: 'integer', enum: [key.expectedVersion] },
    textTh: { type: ['string', 'null'] },
    textEn: { type: ['string', 'null'] },
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
       AND s.answer_receipt_id = $4 AND s.state = 'answered'
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
  const createDraft = ports.createDraft ?? createKnowledgeDraft;
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

  const thai = /\p{Script=Thai}/u;
  if (!textTh || !textEn || !thai.test(textTh) || thai.test(textEn) || !/[a-z]/i.test(textEn) ||
      !candidateTextIsSafe(textTh) || !candidateTextIsSafe(textEn)) return skipped('invalid_candidate');

  const current = await readReceipt(key.data);
  if (!current) return skipped('receipt_unavailable');
  const currentBlocked = blockedReceipt(current, key.data);
  if (currentBlocked) return skipped(currentBlocked);
  if (current.answer !== receipt.answer || current.question !== receipt.question ||
      current.actorUserId !== receipt.actorUserId || current.language !== receipt.language) return skipped('stale_version');

  const requestId = 'ai-owner-review:' + businessId + ':' + caseId + ':' + actionStepId;
  const draft: KnowledgeDraftInput = {
    businessId,
    actorUserId: current.actorUserId,
    kind: 'faq',
    title: scrub(current.question, 255),
    body: 'ไทย\n' + textTh + '\n\nEnglish\n' + textEn,
    sourceRef: requestId + ':receipt:' + answerReceiptId,
    clientRequestId: requestId,
  };
  signal?.throwIfAborted();
  const item = await createDraft(draft);
  const saved = await (ports.readDraftRevision ?? getKnowledgeRevision)(businessId, item.itemId, item.revision);
  if (!saved) throw new AppError('SERVICE_NOT_READY', 'Owner draft revision unavailable', { retryable: true });
  return { kind: 'draft', ...item, candidateDigest: digestOwnerLearningDraft(saved) };
}

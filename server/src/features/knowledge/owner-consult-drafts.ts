import { z } from 'zod';
import { AppError } from '../../core';
import { withOwnerConsultDraftConsent } from '../business-settings/service';
import type { KnowledgeDraftResult, OwnerConsultKnowledgeDraftInput } from '@nless/shared/features/knowledge/types';
import { storeKnowledgeDraft } from './drafts';

const Id = z.uuid().transform((value) => value.toLowerCase());
const ConsentKey = z.object({
  businessId: Id, caseId: Id, actionStepId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), answerReceiptId: Id,
});
const Draft = ConsentKey.extend({ title: z.string().trim().min(1).max(255), body: z.string().trim().min(1).max(20_000) }).strict();

/** Called by trusted analysis jobs with a separate candidate. A case-only answer stays in its original conversation. */
export async function createOwnerConsultKnowledgeDraft(input: OwnerConsultKnowledgeDraftInput): Promise<KnowledgeDraftResult | null> {
  const parsed = Draft.safeParse(input);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR', 'Invalid owner consultation knowledge candidate');
  const { title, body, ...key } = parsed.data;
  const { businessId, caseId, actionStepId, answerReceiptId } = key;
  return withOwnerConsultDraftConsent(key, () => storeKnowledgeDraft({
    businessId, kind: 'faq', title, body, sourceRef: [caseId, actionStepId, answerReceiptId].join(':'),
    clientRequestId: 'owner-consult:' + answerReceiptId, actorUserId: null,
  }, null, 'owner-consult'));
}

export async function confirmOwnerConsultReuse(businessId: string, sourceRef: string | null): Promise<string> {
  const [caseId, actionStepId, answerReceiptId, extra] = (sourceRef ?? '').split(':');
  const parsed = ConsentKey.safeParse({ businessId, caseId, actionStepId, answerReceiptId });
  if (extra !== undefined || !parsed.success || await withOwnerConsultDraftConsent(parsed.data, () => true) !== true) {
    throw new AppError('POLICY_BLOCKED', 'Owner consultation consent is unavailable', { details: { reason: 'owner_consult_consent' } });
  }
  return parsed.data.answerReceiptId;
}

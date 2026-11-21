import { z } from 'zod';
import type { ShopInstructionCandidate } from '@nless/shared/features/business-settings/shop-instructions-types';
import { AppError, db } from '../../core';
import { lockShopInstructionRevisions, readLatestShopInstruction } from './shop-instructions-repo';

const sourceKey = z.object({
  businessId: z.uuid(),
  caseId: z.uuid(),
  actionStepId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
  answerReceiptId: z.uuid(),
}).strict();

const analysisContext = {
  caseId: z.uuid(),
  targetId: z.uuid().nullable(),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(1).max(500),
};
const correction = z.string().trim().min(1).max(2000);
const instructionAnalysis = z.discriminatedUnion('action', [
  z.object({
    ...analysisContext, action: z.enum(['instruction_revise', 'instruction_replace']),
    textTh: correction, textEn: correction,
  }).strict(),
  z.object({ ...analysisContext, action: z.literal('no_change'), textTh: z.null(), textEn: z.null() }).strict(),
]);

export function readShopInstructionAnalysisTarget(businessId: string) {
  return readLatestShopInstruction(db, businessId).then((latest) => ({
    targetId: latest?.id ?? null,
    expectedVersion: latest?.revision ?? 0,
  }));
}

interface MeteredAnalysisResult {
  usageId: string;
  finishReason: string | null;
  json: unknown;
}

/**
 * Called by the internal owner-correction job with the fresh result of core model analysis.
 * The call's usage attribution must use the authenticated receipt ID as turnId.
 */
export async function stageShopInstructionCandidate(
  key: z.input<typeof sourceKey>,
  result: MeteredAnalysisResult,
): Promise<ShopInstructionCandidate | null> {
  const source = sourceKey.safeParse(key);
  const analysis = instructionAnalysis.safeParse(result.json);
  if (!source.success || !analysis.success || !z.uuid().safeParse(result.usageId).success
    || result.finishReason !== 'stop' || analysis.data.caseId !== source.data.caseId) {
    throw new AppError('VALIDATION_ERROR', 'Invalid metered instruction analysis');
  }
  const proposal = analysis.data;
  if (proposal.action === 'no_change') return null;

  const { businessId, caseId, actionStepId, answerReceiptId } = source.data;
  return db.tx(async (tx) => {
    await lockShopInstructionRevisions(tx, businessId);
    // The newest authenticated step must have opted in. No owner answer text is needed here.
    const evidence = await tx.maybeOne(`
      SELECT 1 FROM owner_consult_steps s
      JOIN owner_consult_cases c ON (c.business_id,c.id)=(s.business_id,s.case_id)
      JOIN businesses b ON b.id=s.business_id JOIN accounts a ON a.id=b.account_id
      JOIN model_usage u ON u.business_id=b.id AND u.account_id=a.id AND u.conversation_id=c.conversation_id
      WHERE s.business_id=$1 AND s.case_id=$2 AND s.action_step_id=$3 AND s.answer_receipt_id=$4
        AND s.state='answered' AND s.reuse='propose_draft' AND b.status='active' AND a.status='active'
        AND u.id=$5 AND u.turn_id=s.answer_receipt_id::text AND u.feature_id='F04'
        AND u.purpose='learning.owner-correction' AND u.kind='chat'
        AND u.error_code IS NULL AND u.finish_reason='stop'
        AND NOT EXISTS (
          SELECT 1 FROM owner_consult_steps newer
          WHERE (newer.business_id,newer.case_id)=(s.business_id,s.case_id)
            AND (newer.created_at,newer.action_step_id)>(s.created_at,s.action_step_id)
        )
      FOR SHARE OF s,c,b,a`, [businessId, caseId, actionStepId, answerReceiptId, result.usageId]);
    if (!evidence) return null;

    const latest = await readLatestShopInstruction(tx, businessId);
    if ((latest?.id ?? null) !== proposal.targetId || (latest?.revision ?? 0) !== proposal.expectedVersion) {
      throw new AppError('VERSION_CONFLICT', 'The active shop instruction changed during analysis');
    }
    return tx.maybeOne<ShopInstructionCandidate>(`
      INSERT INTO shop_instruction_candidates
        (business_id,case_id,action_step_id,answer_receipt_id,analysis_usage_id,base_version_id,instruction,reason)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (business_id,answer_receipt_id) DO NOTHING
      RETURNING id,base_version_id AS "baseVersionId",instruction,reason,to_jsonb(created_at)#>>'{}' AS "createdAt",
        encode(sha256(convert_to(instruction,'UTF8')),'hex') AS "candidateDigest",false AS "replayPassed"`,
    [businessId, caseId, actionStepId, answerReceiptId, result.usageId, proposal.targetId,
      proposal.textTh + '\n\n' + proposal.textEn, proposal.reason]);
  });
}

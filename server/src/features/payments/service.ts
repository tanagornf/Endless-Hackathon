import { AppError } from '../../core';
import type { SlipAnalysis, SlipAnalysisInput, SyntheticSlipSpec } from '@nless/shared/features/payments/types';

/**
 * @owner F14 payments · A2 · consumers: B1 F37 evals (dryRun: true), F14 routes
 * Slip check pipeline (docs/specs/F14 §5.4): decode the mini QR printed on Thai bank slips (jsqr on sharp RGBA, full image then crops
 * / upscales), parse its TLV (sending bank + transaction reference), read amount / time / receiver / reference with
 * model.chat vision (alias 'chat', detail 'high', strict JSON schema), then decide ONLY in code: duplicate ref, amount ===
 * expected.amountMinor, receiver digits / name, time window, QR ref vs vision ref (mismatch → 'suspected_forgery').
 * This is NOT bank verification (no bank API): best target status is S. Unknown / other-tenant file → NOT_FOUND; non-image →
 * VALIDATION_ERROR. A provider failure is a verdict ('technical'), not a throw; PROVIDER_BUDGET_EXHAUSTED → verdict 'technical'
 * with needsStaffReason 'provider_budget'. dryRun false + verdict 'verified' records the ref (a later slip with the same ref → 'duplicate').
 * @fake throws AppError('SERVICE_NOT_READY', 'F14 payments not merged yet') (callers treat it as "skipped").
 */
export async function analyzeSlip(input: SlipAnalysisInput): Promise<SlipAnalysis> {
  throw new AppError("SERVICE_NOT_READY", "analyzeSlip is not implemented");
}

/**
 * @owner F14 payments · A2 · consumer: B1 F37 (eval slips). Slip-QR payload the F14 decoder accepts (docs/specs/F14 §9).
 * @fake `NLESS-FIXTURE:<transactionRef>` (not decodable as a real slip QR).
 */
export function makeSlipQrPayload(transactionRef: string, sendingBank?: string): string {
  throw new AppError("SERVICE_NOT_READY", "makeSlipQrPayload is not implemented");
}

/** @owner F14 payments · A2 · consumer: B1 F37. false when the server has no font to draw Thai text. @fake false. */
export async function slipRenderingAvailable(): Promise<boolean> {
  return false;
}

/**
 * @owner F14 payments · A2 · consumer: B1 F37. PNG 720×1280 bytes of a labelled synthetic slip (never a real one).
 * @fake throws AppError('SERVICE_NOT_READY') — F37 then reports its slip cases as skipped `needs_f14`.
 */
export async function renderSyntheticSlip(spec: SyntheticSlipSpec): Promise<Uint8Array> {
  throw new AppError("SERVICE_NOT_READY", "renderSyntheticSlip is not implemented");
}

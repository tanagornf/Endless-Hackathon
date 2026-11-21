export type SlipVerdict = 'verified' | 'wrong_amount' | 'wrong_account' | 'wrong_date' | 'duplicate' | 'unreadable' | 'suspected_forgery' | 'technical';

export interface SlipAnalysisInput {
  businessId: string;
  /** core `files.id` of the slip image (read with storage.read({ businessId }); another business's file → NOT_FOUND). */
  fileId: string;
  expected: {
    amountMinor: number;
    /** Full PromptPay id (mobile / national id / e-wallet) the money should go to; null = skip the digit comparison (name only → never auto-accept). */
    receiverPromptPayId: string | null;
    receiverName: string | null;
    /** ISO UTC. null = no bound. A transfer time outside [notBefore, notAfter] → 'wrong_date'. */
    notBefore: string | null;
    notAfter: string | null;
  };
  /** true = do not record the transaction ref, no audit, no usage of the order tables (evals / preview). Duplicate detection still READS recorded refs. */
  dryRun?: boolean;
  /** Only honoured when SLIP_VERIFY_MODE=sandbox: the labelled simulator outcome. Default 'unreadable'. */
  sandboxOutcome?: SlipVerdict | 'timeout';
}

export interface SlipAnalysis {
  verdict: SlipVerdict;
  /** 'vision' = QR decode + code checks + OpenAI vision read · 'sandbox' = labelled simulator (SLIP_VERIFY_MODE=sandbox). Never "bank verified". */
  mode: 'vision' | 'sandbox';
  /** 0..1, the vision model's legibility score (0 when no vision read happened). */
  confidence: number;
  amountMinor: number | null;
  /** ISO UTC. */
  transferredAt: string | null;
  transactionRef: string | null;
  receiverName: string | null;
  receiverLast4: string | null;
  qr: { found: boolean; sendingBank: string | null; transactionRef: string | null };
  checks: { name: string; pass: boolean; detail: string }[];
  /** verdict 'verified' AND a bank slip QR was decoded AND confidence >= 0.85 AND the receiver matched by digits AND no tamper flag. Anything less = a human must accept. */
  autoAcceptable: boolean;
  needsStaffReason: string | null;
}

export interface SyntheticSlipSpec {
  amountMinor: number;
  /** ISO UTC. */
  transferredAt: string;
  receiverName: string;
  receiverMasked: string;
  transactionRef: string;
  withQr: boolean;
  qrPayload?: string;
  sendingBank?: string;
  patchAmountMinor?: number;
  blur?: boolean;
  notASlip?: boolean;
}

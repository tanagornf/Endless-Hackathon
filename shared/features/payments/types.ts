import type { OrderSummary } from '../orders/types';
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

export interface PaymentSettingsView {
  businessId: string; promptpayKind: 'mobile' | 'national_id' | 'ewallet' | null; promptpayMasked: string | null;
  receiverName: string; includeReference: boolean; requestTtlMinutes: number;
  configured: boolean; validatedAt: string | null; version: number; paymentMode: 'sandbox' | 'real'; slipVerifyMode: 'vision' | 'sandbox';
}
export interface PaymentRequestRow {
  id: string; orderId: string; orderNumber: string; customerName: string; conversationId: string | null;
  amountMinor: number; state: 'open' | 'pending_verification' | 'paid' | 'expired' | 'superseded' | 'cancelled';
  failedAttempts: number; escalated: boolean; expiresAt: string; paidAt: string | null; paidBy: string | null;
  method: 'promptpay_qr'; mode: 'sandbox' | 'real'; createdAt: string; version: number;
}
export interface SlipView {
  id: string; verdict: SlipVerdict; mode: 'vision' | 'sandbox'; confidence: number; autoAcceptable: boolean;
  amountMinor: number | null; transferredAt: string | null; transactionRefMasked: string | null;
  qrFound: boolean; qrSendingBank: string | null; receiverName: string | null; receiverLast4: string | null;
  checks: { name: string; pass: boolean; detail: string }[]; needsStaffReason: string | null;
  staffDecision: 'accepted' | 'rejected' | null; staffNote: string | null; uploadedByKind: 'customer' | 'staff'; createdAt: string;
}
export interface PaymentRequestDetail extends PaymentRequestRow {
  qrFileId: string | null; payUrl: string; receiverMasked: string; receiverName: string; slips: SlipView[];
  receipt: { receiptNo: string; paidAt: string; amountMinor: number; mode: 'sandbox' | 'real' } | null;
}
export interface SlipSubmitResult {
  slipId: string; verdict: SlipVerdict; requestState: PaymentRequestRow['state']; orderPaymentState: OrderSummary['paymentState'];
  attemptsLeft: number; customerMessage: string;           // ข้อความไทยที่แสดง/ส่งให้ลูกค้า (ไม่มีรายละเอียดการตรวจ)
}
export interface PublicPaymentView {
  shopName: string; orderNumber: string; amountMinor: number; state: PaymentRequestRow['state']; expiresAt: string;
  qrImageBase64: string | null; receiverMasked: string; receiverName: string; mode: 'sandbox' | 'real'; attemptsLeft: number;
  receipt: { receiptNo: string; paidAt: string } | null;
  language: 'th' | 'en';   // ภาษาเริ่มต้นของหน้า = getCustomerLanguage ของแชตที่ผูกกับคำขอ หรือภาษาร้าน (§5.5 ตารางสองภาษา)
}
export type PublicSlipResult = Pick<SlipSubmitResult, 'verdict' | 'requestState' | 'attemptsLeft' | 'customerMessage'>;

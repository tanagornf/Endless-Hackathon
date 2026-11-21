export interface OwnerConsultActionKey {
  businessId: string;
  caseId: string;
  actionStepId: string;
}

export interface OpenOwnerConsultInput {
  businessId: string;
  conversationId: string;
  triggerMessageId: string;
  question: string;
  language: 'th' | 'en';
}

export interface OpenOwnerConsultResult {
  caseId: string;
  actionStepId: string;
  version: number;
  created: boolean;
}

export type OwnerConsultReuse = 'case_only' | 'propose_draft';

export interface AnswerOwnerConsultInput {
  caseId: string;
  actionStepId: string;
  expectedVersion: number;
  clientRequestId: string;
  answer: string;
  /** Omit to restrict the answer to this case. */
  reuse?: OwnerConsultReuse;
}

export interface OwnerConsultAnswerReceipt {
  caseId: string;
  version: number;
  state: 'answered';
  answerReceiptId: string;
  reuse: OwnerConsultReuse;
}

export interface OwnerConsultView {
  caseId: string;
  actionStepId: string;
  version: number;
  state: 'pending' | 'answered';
  language: 'th' | 'en';
  question: string;
  answer: string | null;
  reuse: OwnerConsultReuse | null;
}

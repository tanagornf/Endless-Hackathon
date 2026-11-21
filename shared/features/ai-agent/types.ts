export interface GenerateReplyOptions {
  /** 'reply' (default) = answer the customer · 'suggest' = staff draft (F12), never sent automatically. */
  mode?: 'reply' | 'suggest';
  /** The inbound message this turn answers (dedup: same message → same turn, no second model call). */
  triggerMessageId?: string;
  signal?: AbortSignal;
}

export type AiTurnStateName = 'running' | 'completed' | 'awaiting_confirmation' | 'handoff' | 'failed' | 'skipped' | 'superseded';
export type AiIntent =
  | 'GREETING' | 'GOODBYE' | 'QUESTION' | 'REQUEST' | 'STATUS_CHECK' | 'FEEDBACK' | 'CLARIFICATION'
  | 'ESCALATION' | 'OFF_TOPIC' | 'PRICE_CALC' | 'PRODUCT_FILTER' | 'BUSINESS_HOURS' | 'BOOKING_AVAILABILITY' | 'UNKNOWN';

export interface AiToolTrace {
  name: string;
  ok: boolean;
  ms: number;
  error?: string;
  prefetch?: boolean;
}

export interface AiGuardAction {
  guard: 'price' | 'money_words' | 'url' | 'policy_price' | 'policy_contact' | 'sold_out' | 'markdown' | 'language' | 'budget';
  action: 'repair' | 'strip' | 'fallback' | 'note';
  detail: string;
}

export interface AiTurnSummary {
  turnId: string;
  conversationId: string;
  state: AiTurnStateName;
  mode: 'reply' | 'suggest';
  intent: AiIntent | null;
  skipReason: string | null;
  toolCount: number;
  evidenceCount: number;
  guardCount: number;
  latencyMs: number | null;
  startedAt: string;
  replyLanguage: 'th' | 'en' | null;
}

export interface AiTurnUsage {
  calls: number;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  costUsdMicros: number | null;
}

export interface AiTurnTrace extends AiTurnSummary {
  inboundMessageId: string;
  intentSource: 'regex' | 'classifier' | 'fallback' | null;
  intentConfidence: number | null;
  tools: AiToolTrace[];
  evidenceIds: string[];
  productRefs: AiTurnTopic['productRefs'];
  guardActions: AiGuardAction[];
  replyMessageId: string | null;
  handoffOffered: boolean;
  escalated: boolean;
  retryUsed: boolean;
  usage: AiTurnUsage | null;
  timings: Record<string, number | number[]>;
  errorCode: string | null;
  finishedAt: string | null;
  attempts: number;
}

/**
 * @owner F10 ai-agent · B2 · consumer: B3 F27 (seller impact + AI quality cards)
 * Counts and median over ai_turns with mode 'reply' and started_at in [range.from, range.to) (UTC, half-open).
 * turns = all rows · completed / awaitingConfirmation / handoff / failed / skipped = rows by state ('superseded'
 * counts as skipped) · medianLatencyMs = median of latency_ms over rows with state completed | awaiting_confirmation |
 * handoff, null when none.
 * @fake zeros everywhere, medianLatencyMs null (no table yet).
 */
export interface AiTurnMetrics {
  turns: number;
  completed: number;
  awaitingConfirmation: number;
  handoff: number;
  failed: number;
  skipped: number;
  medianLatencyMs: number | null;
}

/**
 * @owner F10 ai-agent · B2 · consumer: F38 follow-ups (same lane, still imported only from service.ts)
 * Persisted reply turns (mode 'reply', state completed | awaiting_confirmation, reply saved) whose finished_at is in
 * [finishedFrom, finishedTo), oldest first, limit default 100 max 500. productRefs = products the turn used
 * (get_price, list_products shown, propose_order); may be []. customerId comes from the conversation row.
 * @fake []
 */
export interface AiTurnTopic {
  turnId: string;
  businessId: string;
  conversationId: string;
  customerId: string;
  inboundMessageId: string;
  inboundCreatedAt: string;
  intent: string | null;
  productRefs: { itemId: string; sku: string; name: string }[];
  replyMessageId: string | null;
  finishedAt: string;
}

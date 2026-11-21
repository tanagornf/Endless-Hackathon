export interface GenerateReplyOptions {
  /** 'reply' (default) = answer the customer · 'suggest' = staff draft (F12), never sent automatically. */
  mode?: 'reply' | 'suggest';
  /** The inbound message this turn answers (dedup: same message → same turn, no second model call). */
  triggerMessageId?: string;
  signal?: AbortSignal;
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

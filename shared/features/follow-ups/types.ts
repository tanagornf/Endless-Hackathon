/**
 * @owner F38 follow-ups · B2 · consumer: B3 F27 (seller impact metrics: "recovered follow-ups")
 * Cohort = follow_ups rows with is_test = false and created_at in [range.from, range.to) (UTC, half-open).
 * scheduled = rows in the cohort · sent = state 'sent' · cancelled = state 'cancelled' or 'failed' (never delivered) ·
 * recovered = sent rows where the customer sent a message or an order was created within 24 h after sent_at.
 * recovered <= sent <= scheduled.
 * @fake all zeros.
 */
export interface FollowUpMetrics {
  scheduled: number;
  sent: number;
  cancelled: number;
  recovered: number;
}

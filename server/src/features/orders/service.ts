import { AppError } from '../../core';
import type { CreateOrderFromProposalInput, CreateOrderFromProposalResult, OrderMetrics, OrderSummary } from '@nless/shared/features/orders/types';
import type { MetricsRange } from '@nless/shared/core/types';

/**
 * @owner F13 orders · A2 · consumers: B2 (AI tool: stage 'propose' only), A1/C2 postback → stage 'confirm'
 * propose: prices via getPrice, shipping via SEED/business rule, sold out → SOLD_OUT, qty ≤ 0 → VALIDATION_ERROR.
 * confirm: same clientRequestId + same payload → same receipt (replayed true); same id + other payload →
 * IDEMPOTENCY_CONFLICT; price/stock changed since the quote → VERSION_CONFLICT; expired → PROPOSAL_EXPIRED.
 * Order row + receipt + outbox in one transaction. decision 'cancel' → order null.
 * @fake propose: computed from SEED (prices + SPEC shipping rule), NOT persisted, proposal.id =
 *   `fake-proposal-<clientRequestId>`, version 1, expiresAt now+15min, reviewToken `fake-review-<clientRequestId>`.
 *   confirm: throws AppError('SERVICE_NOT_READY', 'F13 orders not merged yet') (R8).
 */
export async function createOrderFromProposal(input: CreateOrderFromProposalInput): Promise<CreateOrderFromProposalResult> {
  throw new AppError("SERVICE_NOT_READY", "createOrderFromProposal is not implemented");
}

/**
 * @owner F13 orders · A2 · consumer: B3 F27 (seller impact metrics)
 * Half-open UTC range [range.from, range.to). Cancelled orders count in ordersCreated but never in ordersPaid / revenueMinor
 * unless they were paid and are still payment_state 'paid' (cancelled-and-refunded are excluded). ordersFromChat <= ordersCreated.
 * Invalid range (from >= to, not ISO) → VALIDATION_ERROR. Tenant-scoped by businessId.
 * @fake all zeros: { ordersCreated: 0, ordersFromChat: 0, ordersPaid: 0, revenueMinor: 0 }.
 */
export async function getOrderMetrics(businessId: string, range: MetricsRange): Promise<OrderMetrics> {
  throw new AppError("SERVICE_NOT_READY", "getOrderMetrics is not implemented");
}

/**
 * @owner F13 orders · A2 · consumers: B2 F38 follow-ups (did the customer order?), B2 F10
 * Newest first. opts.since = created_at >= since (ISO UTC). limit default 20, max 100 (more → 100; < 1 or not an integer →
 * VALIDATION_ERROR). Returns every status including 'cancelled' (callers filter). Another business's customer → [].
 * @fake [] (no orders).
 */
export async function listOrdersByCustomer(
  businessId: string,
  customerId: string,
  opts?: { since?: string; limit?: number },
): Promise<OrderSummary[]> {
  throw new AppError("SERVICE_NOT_READY", "listOrdersByCustomer is not implemented");
}

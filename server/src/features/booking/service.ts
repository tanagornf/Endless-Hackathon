import { AppError } from '../../core';
import type { ProductRef } from '@nless/shared/features/catalog/types';
import type { CustomerLanguage } from '@nless/shared/core/language';
import type { CreateBookingInput, CreateBookingResult, SlotOption } from '@nless/shared/features/booking/types';

/**
 * @owner F15 booking · A3 · consumers: B2 (AI tool), A3 calendar
 * Free slots for a service between from/to (ISO UTC), respecting hours (getBusinessSettings), closures, capacity.
 * @fake SEED.slots of that business/service inside [from, to) with remaining = capacity (1).
 *   A-SERVICE-01 → 2026-11-22T03:00:00Z–03:30:00Z (10:00–10:30 Bangkok), resource A1.
 */
export async function findSlots(
  businessId: string,
  query: { serviceRef: ProductRef; from: string; to: string; resourceId?: string; limit?: number; language?: CustomerLanguage },
): Promise<SlotOption[]> {
  throw new AppError("SERVICE_NOT_READY", "findSlots is not implemented");
}

/**
 * @owner F15 booking · A3. Same two-stage consent shape as orders.
 * confirm: capacity re-checked in a transaction (two racers for a capacity-1 slot → one wins, the other
 * SLOT_FULL); idempotency like orders; externalSync starts 'pending' or 'not_configured'.
 * @fake propose: from SEED.slots, not persisted, ids `fake-proposal-<clientRequestId>`; slot not in SEED → SLOT_FULL.
 *   confirm: throws AppError('SERVICE_NOT_READY', 'F15 booking not merged yet') (R8).
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  throw new AppError("SERVICE_NOT_READY", "createBooking is not implemented");
}

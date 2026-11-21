import type { ProductRef } from '@nless/shared/features/catalog/types';
import type { CustomerLanguage } from '@nless/shared/core/language';
import type { BookingReviewPart, ConfirmRequest, ProposalSummary } from '@nless/shared/core/types';

export interface SlotOption {
  serviceId: string;
  resourceId: string;
  resourceName: string;
  startAt: string;
  endAt: string;
  capacity: number;
  remaining: number;
  /** Server-rendered Asia/Bangkok label in query.language (default: the business language): '22 พ.ย. 2569 10:00' | '22 Nov 2026 10:00'. */
  localDisplay: string;
}

export interface AppointmentSummary {
  id: string;
  businessId: string;
  conversationId: string | null;
  serviceId: string;
  resourceId: string;
  startAt: string;
  endAt: string;
  status: 'booked' | 'cancelled' | 'completed' | 'no_show';
  /** F16 calendar sync is separate from the local booking. */
  externalSync: { state: 'not_configured' | 'pending' | 'synced' | 'failed' };
  version: number;
}

export type CreateBookingInput =
  | {
      stage: 'propose';
      businessId: string;
      conversationId: string;
      serviceRef: ProductRef;
      resourceId?: string;
      startAt: string;
      customerName?: string;
      clientRequestId: string;
      /** Language of review.localDisplay and proposal.summary. Omitted → getCustomerLanguage(conversationId). */
      language?: CustomerLanguage;
    }
  | ({
      stage: 'confirm';
      businessId: string;
      conversationId: string;
      actor: { kind: 'customer' | 'staff'; userId?: string | null };
    } & ConfirmRequest);

export type CreateBookingResult =
  | { stage: 'propose'; state: 'awaiting_confirmation'; proposal: ProposalSummary; review: BookingReviewPart }
  | { stage: 'confirm'; receiptId: string; replayed: boolean; appointment: AppointmentSummary | null; decision: 'confirm' | 'cancel' };

import type { ConfirmRequest, OrderReviewPart, ProposalSummary, ReviewLine } from '@nless/shared/core/types';
import type { ProductRef } from '@nless/shared/features/catalog/types';

export interface OrderSummary {
  id: string;
  businessId: string;
  conversationId: string | null;
  status: 'awaiting_payment' | 'paid' | 'preparing' | 'shipped' | 'delivered' | 'cancelled';
  paymentState: 'unpaid' | 'pending_verification' | 'paid' | 'refunded';
  lines: ReviewLine[];
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  currency: 'THB';
  version: number;
  createdAt: string;
}

export type CreateOrderFromProposalInput =
  | {
      /** AI tool / staff: build an immutable quote from canonical prices. No order yet. */
      stage: 'propose';
      businessId: string;
      conversationId: string;
      items: { ref: ProductRef; variantId?: string | null; quantity: number }[];
      deliveryMethod: 'shipping' | 'pickup';
      clientRequestId: string;
    }
  | ({
      /** The customer's consent action (button/postback/web confirm). NEVER triggered by model text. */
      stage: 'confirm';
      businessId: string;
      conversationId: string;
      actor: { kind: 'customer' | 'staff'; userId?: string | null };
    } & ConfirmRequest);

export type CreateOrderFromProposalResult =
  | { stage: 'propose'; state: 'awaiting_confirmation'; proposal: ProposalSummary; review: OrderReviewPart }
  | { stage: 'confirm'; receiptId: string; replayed: boolean; order: OrderSummary | null; decision: 'confirm' | 'cancel' };

export interface OrderMetrics {
  /** Orders created (confirmed by the customer) with created_at in [from, to). */
  ordersCreated: number;
  /** Of those, orders whose proposal came from the AI tool (origin 'ai'): "orders the AI proposed and the customer confirmed". */
  ordersFromChat: number;
  /** Orders with paid_at in [from, to) whose payment_state is still 'paid' (refunded excluded). */
  ordersPaid: number;
  /** Sum of total_minor of those paid orders, in satang. */
  revenueMinor: number;
}

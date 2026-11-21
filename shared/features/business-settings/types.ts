import type { WeeklyHours } from '@nless/shared/core/types';

/**
 * Merchant answer policy (Papi custom_configuration.answer_policy). null = fully permissive.
 * Final behavior = capability ∩ policy, deny wins.
 */
export interface AnswerPolicy {
  price?: { reveal: 'always' | 'never' | 'ask_staff' };
  stock?: { reveal: 'always' | 'never' | 'ask_staff' };
  contact?: { reveal: 'always' | 'never' };
  /** false = answer only from the business's knowledge/catalog, no general world knowledge. */
  generalKnowledge?: boolean;
  booking?: { enabled: boolean };
}

export interface BusinessSettings {
  businessId: string;
  aiEnabled: boolean;
  timezone: string;
  hours: WeeklyHours;
  answerPolicy: AnswerPolicy | null;
  language: 'th' | 'en';
  version: number;
}

export interface BusinessProfile {
  name: string;
  description: string;
  contactPhone: string | null;
  contactEmail: string | null;
  address: string | null;
}

/** A closure period in the business's local dates ('YYYY-MM-DD', inclusive). */
export interface BusinessClosure {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface MerchantCapabilities {
  /** false = the shop never reveals prices to customers. */
  canQuotePrices: boolean;
  /** Orders through chat (AI tool propose_order). */
  canTakeOrders: boolean;
  /** Bookings through chat (find_slots / propose_booking). */
  canTakeBookings: boolean;
  /** Handoff to staff (handoff_to_staff). */
  canHandoffToHuman: boolean;
  /** The shop's phone / e-mail may be revealed. */
  canShareContact: boolean;
}

/** capability ∩ answerPolicy, deny wins. F10 decides tools and prompt directives from this, not from answerPolicy alone. */
export interface EffectiveAnswerRules {
  price: 'always' | 'never' | 'ask_staff';
  stock: 'always' | 'never' | 'ask_staff';
  contact: 'always' | 'never';
  generalKnowledge: boolean;
  booking: boolean;
  orders: boolean;
  handoff: boolean;
}

export interface BusinessOpenState {
  open: boolean;
  reason: 'open' | 'outside_hours' | 'closed_day' | 'closure';
  /** 'YYYY-MM-DD' and 'HH:mm' in the business timezone. */
  localDate: string;
  localTime: string;
  timezone: string;
  /** ISO UTC; null = no opening time in the next 31 days. */
  nextOpenAt: string | null;
  /** Set when reason is 'closure'. */
  closure: BusinessClosure | null;
}

export interface SettingsView {
  settings: BusinessSettings;
  aiSwitch: boolean;
  aiBlockedReason: 'business_inactive' | 'account_inactive' | null;
  profile: BusinessProfile;
  capabilities: MerchantCapabilities;
  effectiveRules: EffectiveAnswerRules;
}

export const BUSINESS_WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export type AnswerPolicyPatch = { [Key in keyof AnswerPolicy]?: AnswerPolicy[Key] | null };
export type { AnswerOwnerConsultInput, OpenOwnerConsultInput, OpenOwnerConsultResult, OwnerConsultActionKey, OwnerConsultAnswerReceipt, OwnerConsultReuse, OwnerConsultView } from './owner-consult-types';
export { OWNER_CONSULT_ANSWER_JOB } from './owner-consult-types';
export type { OwnerConsultAnswerForResume, OwnerConsultAnswerKey } from './owner-consult-types';
export type {
  ActiveShopInstruction, ShopInstructionActivation, ShopInstructionCandidate, ShopInstructionReview, ShopInstructionVersion,
} from './shop-instructions-types';

import type { WeeklyHours } from '@nless/shared/core/types';
import type { AnswerPolicy, MerchantCapabilities } from '@nless/shared/features/business-settings/types';

const standardDay = [{ open: '09:00', close: '18:00' }];

export const DEFAULT_HOURS: WeeklyHours = {
  mon: standardDay,
  tue: standardDay,
  wed: standardDay,
  thu: standardDay,
  fri: standardDay,
  sat: standardDay,
  sun: [],
};

export const DEFAULT_CAPABILITIES: MerchantCapabilities = {
  canQuotePrices: true,
  canTakeOrders: true,
  canTakeBookings: true,
  canHandoffToHuman: true,
  canShareContact: true,
};

export const RESTRICTIVE_POLICY: AnswerPolicy = {
  price: { reveal: 'never' },
  stock: { reveal: 'never' },
  contact: { reveal: 'never' },
  generalKnowledge: false,
  booking: { enabled: false },
};

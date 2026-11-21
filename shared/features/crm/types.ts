import type { Channel, MarketingConsent } from '@nless/shared/core/types';

export interface CustomerSummary {
  id: string;
  businessId: string;
  displayName: string;
  channel: Channel;
  externalId: string;
  tagIds: string[];
  marketingConsent: MarketingConsent;
  lastSeenAt: string | null;
}

export interface CustomerProfile extends CustomerSummary {
  /** Manual = set by staff; inferred = model/automation guess, shown as inferred, never as fact. */
  tags: { id: string; name: string; source: 'manual' | 'automation' | 'inferred' }[];
  contact: { phone?: string | null; email?: string | null; address?: string | null };
  note: string | null;
  firstSeenAt: string | null;
}

/** One tag of the business with how many customers carry it. */
export interface TagSummary {
  id: string;
  name: string;
  customerCount: number;
}

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

export type TagSource = 'manual' | 'automation' | 'inferred';
export interface CrmTag { id: string; name: string; description: string; color: string; version: number; customerCount: number; ruleCount: number }
export interface CrmCustomerRow {
  id: string; displayName: string; channel: Channel; tags: { id: string; name: string; color: string; source: TagSource }[];
  marketingConsent: MarketingConsent; lastSeenAt: string | null; phone: string | null; memberCount: number; /* 1 = ไม่เคยรวม */
}
export interface CrmCustomerDetail extends CrmCustomerRow {
  externalIdMasked: string;                                  // 4 ตัวท้าย เช่น "…a3f1" (ไม่ส่ง externalId เต็มไป UI รายการ/รายละเอียด)
  firstSeenAt: string | null;
  contact: { phone: string | null; email: string | null; address: string | null }; note: string | null; profileVersion: number;
  members: { customerId: string; displayName: string; channel: Channel; lastSeenAt: string | null; isPrimary: boolean }[];
  consent: { status: MarketingConsent; source: string | null; updatedAt: string | null; history: { status: string; previousStatus: string; source: string; actorName: string | null; reason: string; createdAt: string }[] };
  lastConversationId: string | null;
}
export interface CustomerPanelData { customerId: string; detail: CrmCustomerDetail; canEditTags: boolean; canCreateTags: boolean; availableTags: { id: string; name: string; color: string }[]; mergeCandidateCount: number }

import type { PermissionKey } from '@nless/shared/core/permissions';

export const NOTIFICATION_TYPES = [
  'chat.handoff', 'chat.mention', 'order.created', 'payment.verifying',
  'booking.created', 'booking.cancelled', 'invitation', 'report', 'system',
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];

export interface NotifyInput {
  businessId: string;
  /** Explicit users, active owners, or members with the required permission. */
  to: { userIds: string[] } | { role: 'owners' } | { permission: PermissionKey };
  type: NotificationType;
  title: string;
  body?: string;
  /** An internal app path from the trusted producer. */
  link?: string;
  /** Same key again returns no new notification. */
  dedupKey?: string;
}

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}
export interface NotificationFeed {
  items: NotificationItem[];
  nextCursor: string | null;
  unreadCount: number;
  unreadElsewhere: number;
}
export interface UnreadCount { count: number; elsewhere: number }
export type MarkReadInput = { ids: string[] } | { all: true };

export interface PreferenceRow {
  type: NotificationType;
  inApp: boolean;
  push: boolean;
  forcedInApp: boolean;
}
export interface PushStatus {
  configured: boolean;
  mode: 'real' | 'sandbox';
  publicKey: string | null;
  subscriptions: number;
  lastAcceptedAt: string | null;
  lastAckAt: string | null;
}
export interface PushTestResult {
  attempted: number;
  accepted: number;
  gone: number;
  failed: number;
  mode: 'real' | 'sandbox';
}
export interface PushOpenDestination { businessId: string; link: string | null }

import type { PermissionKey } from '@nless/shared/core/permissions';

export interface NotifyInput {
  businessId: string;
  /** Explicit users, or every active owner of the business. Recipients must be members (no cross-tenant). */
  to: { userIds: string[] } | { role: 'owners' } | { permission: PermissionKey };
  type: 'chat.handoff' | 'chat.mention' | 'order.created' | 'payment.verifying' | 'booking.created' | 'booking.cancelled' | 'invitation' | 'report' | 'system';
  title: string;
  body?: string;
  /** In-app path, e.g. '/chat?c=<id>'. Never an external URL from user/model content. */
  link?: string;
  /** Same key again → no new notification. */
  dedupKey?: string;
}

import type { PermissionKey } from '@nless/shared/core/permissions';
import { NOTIFICATION_TYPES } from '@nless/shared/features/notifications/types';
import type { NotificationType } from '@nless/shared/features/notifications/types';

export const TYPE_PERMISSION: Record<NotificationType, PermissionKey> = {
  'chat.handoff': 'chat.read',
  'chat.mention': 'chat.read',
  'order.created': 'orders.read',
  'payment.verifying': 'orders.read',
  'booking.created': 'appointments.read',
  'booking.cancelled': 'appointments.read',
  invitation: 'business.read',
  report: 'business.read',
  system: 'business.read',
};

export interface Grants { role?: string; permissions: readonly string[] }

export function canSeeNotification(grants: Grants, type: NotificationType): boolean {
  return grants.role === 'owner' || grants.permissions.includes(TYPE_PERMISSION[type]);
}

export function allowedTypes(grants: Grants): NotificationType[] {
  return NOTIFICATION_TYPES.filter((type) => canSeeNotification(grants, type));
}

export const PREF_DEFAULTS: Record<NotificationType, { inApp: boolean; push: boolean }> = {
  'chat.handoff': { inApp: true, push: true },
  'chat.mention': { inApp: true, push: true },
  'order.created': { inApp: true, push: true },
  'payment.verifying': { inApp: true, push: false },
  'booking.created': { inApp: true, push: false },
  'booking.cancelled': { inApp: true, push: false },
  invitation: { inApp: true, push: false },
  report: { inApp: true, push: false },
  system: { inApp: true, push: true },
};

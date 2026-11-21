import type { MembershipRole, PermissionKey } from '@nless/shared/core/permissions';

export interface MemberRow {
  userId: string;
  email: string;
  displayName: string;
  role: MembershipRole;
  status: 'active' | 'revoked';
  permissions: PermissionKey[];
  isAccountOwner: boolean;
  isSelf: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export type PermissionPresetId = 'viewer' | 'chat_team' | 'manager';

export const VIEWER_PERMISSIONS: readonly PermissionKey[] = [
  'chat.read', 'orders.read', 'product.read', 'appointments.read', 'business.read',
];

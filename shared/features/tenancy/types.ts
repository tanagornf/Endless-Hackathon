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

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'declined' | 'expired';

export interface InvitationRow {
  id: string;
  email: string;
  status: InvitationStatus;
  permissions: PermissionKey[];
  expiresAt: string;
  createdAt: string;
  invitedByName: string | null;
  acceptedAt: string | null;
}

export interface InvitationCreated {
  invitation: InvitationRow;
  link: string;
  delivery: 'link_only' | 'email_sandbox' | 'email_sent';
}

export interface InvitationPreview {
  businessName: string;
  emailMasked: string;
  role: 'staff';
  expiresAt: string;
  permissionsCount: number;
}

import type { MembershipRole } from '@nless/shared/core/permissions';

export interface MyBusinessRow {
  businessId: string;
  name: string;
  status: 'active' | 'suspended' | 'deleted';
  role: MembershipRole;
  /** This shop belongs to the account owned by the signed-in user. */
  isCurrentAccount: boolean;
}

export interface ProvisionedAccount {
  accountId: string;
  businessId: string;
  created: boolean;
}

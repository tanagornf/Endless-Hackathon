import type { InvitationCreated, InvitationRow } from '@nless/shared/features/tenancy/types';

export async function deliverInvitation(_invitation: InvitationRow, _link: string): Promise<InvitationCreated['delivery']> {
  return 'link_only';
}

import type { InvitationCreated } from '@nless/shared/features/tenancy/types';
import { config, db, log } from '../../core';
import { queueEmail } from '../auth/service';
import { hashInvitationToken } from './tokens';

type MailContext = {
  email: string;
  businessName: string;
  inviterName: string | null;
  expiresAt: Date;
  language: 'th' | 'en';
  timezone: string;
};

export async function deliverInvitation(businessId: string, invitationId: string, link: string): Promise<InvitationCreated['delivery']> {
  try {
    const url = new URL(link);
    const token = url.searchParams.get('token');
    if (url.origin !== new URL(config.APP_BASE_URL).origin || url.pathname !== '/invitations/accept' ||
        !token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return 'link_only';

    // Resolve the recipient and shop from the committed invitation and current token generation.
    const mail = await db.maybeOne<MailContext>(
      'SELECT i.email,b.name AS "businessName",inviter.display_name AS "inviterName",' +
      'i.expires_at AS "expiresAt",b.language,b.timezone ' +
      'FROM invitations i JOIN businesses b ON b.id=i.business_id JOIN accounts a ON a.id=b.account_id ' +
      'LEFT JOIN users inviter ON inviter.id=i.invited_by ' +
      "WHERE i.id=$1 AND i.token_hash=$2 AND i.business_id=$3 AND i.status='pending' AND i.expires_at>statement_timestamp() " +
      "AND b.status='active' AND a.status='active'",
      [invitationId, hashInvitationToken(token), businessId],
    );
    if (!mail) return 'link_only';

    const when = new Intl.DateTimeFormat(mail.language === 'th' ? 'th-TH' : 'en-GB', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: mail.timezone,
    }).format(mail.expiresAt);
    const receipt = await queueEmail({
      to: mail.email,
      template: 'invitation',
      locale: mail.language,
      vars: {
        business: mail.businessName,
        inviter: mail.inviterName?.trim() || (mail.language === 'th' ? 'ทีมงานร้าน' : 'The shop team'),
        when,
      },
      actionUrl: link,
    });
    return receipt.outboxId ? receipt.delivery : 'link_only';
  } catch {
    // The invitation is already committed. Leave its copy link usable and avoid replaying a possibly committed write.
    log.warn({ invitationId }, 'Invitation sandbox mail was not confirmed');
    return 'link_only';
  }
}

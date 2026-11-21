import { z } from 'zod';
import type { AuthUser } from '@nless/shared/core/types';
import type { MailboxItem, MailboxScope } from '@nless/shared/features/auth/types';
import { AppError, db, decryptSecret } from '../../core';

export const MailboxQuery = z.object({ scope: z.enum(['mine', 'all']).default('mine') }).strict();

type Row = {
  id: string;
  to_email: string;
  template: MailboxItem['template'];
  subject: string;
  body_text: string;
  action_url_enc: string;
  created_at: Date;
  expires_at: Date;
};

export async function listMailbox(user: Pick<AuthUser, 'email' | 'isPlatformAdmin'>, scope: MailboxScope) {
  const all = scope === 'all';
  if (all && !user.isPlatformAdmin) throw new AppError('PERMISSION_DENIED', 'Mailbox scope requires administrator access');
  const { rows } = await db.query<Row>(
    `SELECT id, to_email, template, subject, body_text, action_url_enc, created_at, expires_at
     FROM email_outbox WHERE expires_at > now()${all ? '' : ' AND to_email_normalized = $1'}
     ORDER BY created_at DESC, id DESC LIMIT ${all ? 100 : 20}`,
    all ? [] : [user.email.trim().toLowerCase()],
  );
  const items: MailboxItem[] = rows.map((row) => ({
    id: row.id,
    to: row.to_email,
    template: row.template,
    subject: row.subject,
    bodyText: row.body_text,
    actionUrl: decryptSecret(row.action_url_enc),
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    mode: 'sandbox',
  }));
  return { scope, items };
}

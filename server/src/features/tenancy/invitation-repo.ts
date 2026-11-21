import { z } from 'zod';
import type { InvitationRow, InvitationStatus } from '@nless/shared/features/tenancy/types';
import { AppError, db } from '../../core';
import type { DbExecutor } from '../../core';
import { effectivePermissions } from './permissions';
import { hashInvitationToken } from './tokens';

type StoredStatus = Exclude<InvitationStatus, 'expired'>;
export interface InvitationRecord {
  id: string;
  email: string;
  email_normalized: string;
  status: StoredStatus;
  permissions: string[];
  expires_at: Date;
  created_at: Date;
  accepted_at: Date | null;
  inviter_name: string | null;
  expired: boolean;
  business_id: string;
  account_id: string;
  business_name: string;
  business_status: string;
  account_status: string;
  language: 'th' | 'en';
}

const selectInvitation =
  'SELECT i.id,i.email,i.email_normalized,i.status,i.permissions,i.expires_at,i.created_at,i.accepted_at,' +
  'inviter.display_name AS inviter_name,(i.expires_at <= statement_timestamp()) AS expired,' +
  'i.business_id,b.account_id,b.name AS business_name,b.status AS business_status,a.status AS account_status,b.language ' +
  'FROM invitations i JOIN businesses b ON b.id=i.business_id JOIN accounts a ON a.id=b.account_id ' +
  'LEFT JOIN users inviter ON inviter.id=i.invited_by';

export function toInvitationRow(row: InvitationRecord): InvitationRow {
  return {
    id: row.id, email: row.email, status: row.status === 'pending' && row.expired ? 'expired' : row.status,
    permissions: effectivePermissions('staff', row.permissions),
    expiresAt: row.expires_at.toISOString(), createdAt: row.created_at.toISOString(),
    acceptedAt: row.accepted_at?.toISOString() ?? null, invitedByName: row.inviter_name,
  };
}

export function invitationNotFound(): never {
  throw new AppError('NOT_FOUND', 'Invitation not found');
}

export function invitationBlocked(reason: string): never {
  throw new AppError('POLICY_BLOCKED', 'Invitation action is not allowed', { details: { reason } });
}

export const TokenBody = z.strictObject({ token: z.string().min(40).max(64).regex(/^[A-Za-z0-9_-]+$/) });

export function parseInvitationToken(value: unknown): string {
  const parsed = TokenBody.safeParse(value);
  if (!parsed.success) invitationNotFound();
  return parsed.data.token;
}

export function lookupDigest(token: string): string {
  return hashInvitationToken(parseInvitationToken({ token }));
}

export async function lockInvitationKey(tx: DbExecutor, key: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
}

export async function listInvitations(businessId: string, status?: InvitationStatus): Promise<{ items: InvitationRow[] }> {
  const { rows } = await db.query<InvitationRecord>(
    selectInvitation + ' WHERE i.business_id=$1 AND ($2::text IS NULL OR $2=' +
    "CASE WHEN i.status='pending' AND i.expires_at<=statement_timestamp() THEN 'expired' ELSE i.status END)" +
    ' ORDER BY i.created_at DESC,i.id DESC',
    [businessId, status ?? null],
  );
  return { items: rows.map(toInvitationRow) };
}

export async function readManagedInvitation(tx: DbExecutor, businessId: string, id: string): Promise<InvitationRecord> {
  if (!z.guid().safeParse(id).success) invitationNotFound();
  const row = await tx.maybeOne<InvitationRecord>(
    selectInvitation + ' WHERE i.business_id=$1 AND i.id=$2',
    [businessId, id],
  );
  if (!row) invitationNotFound();
  return row;
}

export async function readTokenInvitation(ex: DbExecutor, hash: string): Promise<InvitationRecord> {
  const row = await ex.maybeOne<InvitationRecord>(selectInvitation + ' WHERE i.token_hash=$1', [hash]);
  if (!row) invitationNotFound();
  return row;
}

export async function lockTokenInvitation(tx: DbExecutor, hash: string): Promise<InvitationRecord> {
  const hint = await tx.maybeOne<{ business_id: string }>('SELECT business_id FROM invitations WHERE token_hash=$1', [hash]);
  if (!hint) invitationNotFound();
  await lockInvitationKey(tx, 'tenancy:' + hint.business_id);
  const locked = await tx.maybeOne<{ id: string }>(
    'SELECT id FROM invitations WHERE token_hash=$1 AND business_id=$2 FOR UPDATE', [hash, hint.business_id],
  );
  if (!locked) invitationNotFound();
  return readTokenInvitation(tx, hash);
}

export function assertUsable(row: InvitationRecord): void {
  if (row.status !== 'pending') invitationBlocked(row.status);
  if (row.expired) invitationBlocked('expired');
}

export async function assertSingleAccount(tx: DbExecutor, userId: string, accountId: string, activeOnly: boolean): Promise<void> {
  const { exists } = await tx.one<{ exists: boolean }>(
    'SELECT EXISTS (SELECT 1 FROM accounts WHERE owner_user_id=$1 AND id<>$2 UNION ALL ' +
    'SELECT 1 FROM memberships m JOIN businesses b ON b.id=m.business_id ' +
    "WHERE m.user_id=$1 AND b.account_id<>$2 AND (NOT $3::boolean OR m.status='active'))",
    [userId, accountId, activeOnly],
  );
  if (exists) invitationBlocked('user_in_other_account');
}

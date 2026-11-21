import { STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import type { InvitationCreated, InvitationPreview, InvitationRow } from '@nless/shared/features/tenancy/types';
import { AppError, assertRateLimit, audit, config, db, log, publish } from '../../core';
import type { DbExecutor } from '../../core';
import { notify } from '../notifications/service';
import { deliverInvitation } from './invitation-mail';
import {
  assertSingleAccount, assertUsable, invitationBlocked, lockInvitationKey,
  lockTokenInvitation, lookupDigest, readManagedInvitation, readTokenInvitation, toInvitationRow,
} from './invitation-repo';
import type { InvitationRecord } from './invitation-repo';
import { effectivePermissions, validatePermissionKeys } from './permissions';
import { createInvitationToken, hashInvitationToken, maskInvitationEmail } from './tokens';

const inviteLock = (email: string) => 'tenancy-invite-email:' + hashInvitationToken(email);
const expiry = "clock_timestamp() + $4::integer * interval '1 hour'";

async function lockOwner(tx: DbExecutor, businessId: string, actorUserId: string): Promise<string> {
  await lockInvitationKey(tx, 'tenancy:' + businessId);
  const actor = await tx.maybeOne<{ role: string; account_id: string; active: boolean }>(
    "SELECT m.role,b.account_id,(b.status='active' AND a.status='active') AS active " +
    "FROM memberships m JOIN businesses b ON b.id=m.business_id JOIN accounts a ON a.id=b.account_id " +
    "WHERE m.business_id=$1 AND m.user_id=$2 AND m.status='active'",
    [businessId, actorUserId],
  );
  if (!actor) throw new AppError('NOT_FOUND', 'Business not found');
  if (actor.role !== 'owner') throw new AppError('PERMISSION_DENIED', 'Permission required');
  if (!actor.active) throw new AppError('BUSINESS_INACTIVE', 'Business inactive');
  return actor.account_id;
}

function limitOwnerSends(businessId: string): void {
  assertRateLimit({ key: 'tenancy.invite:' + businessId, limit: 30, windowSeconds: 3600 });
}

async function delivery(row: InvitationRecord, token: string): Promise<InvitationCreated> {
  const invitation = toInvitationRow(row);
  const link = new URL('/invitations/accept', config.APP_BASE_URL);
  link.searchParams.set('token', token);
  const url = link.toString();
  return { invitation, link: url, delivery: await deliverInvitation(invitation, url) };
}

function auditInvitation(action: string, row: InvitationRecord, actorUserId: string | null,
  details: Record<string, unknown> = {}): Promise<void> {
  return audit({
    action: 'tenancy.invitation.' + action, actorUserId, businessId: row.business_id,
    accountId: row.account_id, targetType: 'invitation', targetId: row.id,
    details: { invitationId: row.id, ...details },
  });
}

export async function createInvitation(businessId: string, actorUserId: string,
  input: { email: string; permissions?: string[] }): Promise<InvitationCreated> {
  limitOwnerSends(businessId);
  const permissions = validatePermissionKeys(input.permissions ?? STAFF_DEFAULT_PERMISSIONS);
  const email = input.email.trim().toLowerCase();
  const token = createInvitationToken();
  const row = await db.tx(async (tx) => {
    await lockInvitationKey(tx, inviteLock(email));
    const accountId = await lockOwner(tx, businessId, actorUserId);
    await tx.query(
      "UPDATE invitations SET status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp() " +
      "WHERE business_id=$1 AND status='pending' AND expires_at<=clock_timestamp()",
      [businessId],
    );
    const recipient = await tx.maybeOne<{ id: string; status: string | null }>(
      'SELECT u.id,m.status FROM users u LEFT JOIN memberships m ON m.user_id=u.id AND m.business_id=$1 ' +
      'WHERE u.email_normalized=$2',
      [businessId, email],
    );
    if (recipient?.status === 'active') invitationBlocked('already_member');
    if (recipient?.status === 'revoked') invitationBlocked('member_revoked');
    const { total, duplicate } = await tx.one<{ total: number; duplicate: boolean | null }>(
      "SELECT count(*)::integer AS total,bool_or(email_normalized=$2) AS duplicate FROM invitations " +
      "WHERE business_id=$1 AND status='pending'",
      [businessId, email],
    );
    if (duplicate) invitationBlocked('already_invited');
    if (total >= 100) invitationBlocked('too_many_pending');
    if (recipient) await assertSingleAccount(tx, recipient.id, accountId, true);
    const { id } = await tx.one<{ id: string }>(
      'INSERT INTO invitations(business_id,email,permissions,expires_at,token_hash,invited_by) ' +
      'VALUES($1,$2,$3,' + expiry + ',$5,$6) RETURNING id',
      [businessId, email, permissions, config.INVITATION_TTL_HOURS, hashInvitationToken(token), actorUserId],
    );
    return readManagedInvitation(tx, businessId, id);
  });
  await auditInvitation('create', row, actorUserId, { emailHash: hashInvitationToken(email).slice(0, 12) });
  return delivery(row, token);
}

export async function resendInvitation(businessId: string, actorUserId: string, id: string): Promise<InvitationCreated> {
  limitOwnerSends(businessId);
  const token = createInvitationToken();
  const row = await db.tx(async (tx) => {
    await lockOwner(tx, businessId, actorUserId);
    const invitation = await readManagedInvitation(tx, businessId, id);
    if (invitation.status !== 'pending') invitationBlocked('not_pending');
    const updated = await tx.query(
      'UPDATE invitations SET token_hash=$3,expires_at=' + expiry + ',updated_at=clock_timestamp() ' +
      "WHERE business_id=$1 AND id=$2 AND status='pending'",
      [businessId, id, hashInvitationToken(token), config.INVITATION_TTL_HOURS],
    );
    if (!updated.rowCount) invitationBlocked('not_pending');
    return readManagedInvitation(tx, businessId, id);
  });
  await auditInvitation('resend', row, actorUserId);
  return delivery(row, token);
}

export async function revokeInvitation(businessId: string, actorUserId: string, id: string): Promise<InvitationRow> {
  const { row, changed } = await db.tx(async (tx) => {
    await lockOwner(tx, businessId, actorUserId);
    const invitation = await readManagedInvitation(tx, businessId, id);
    if (invitation.status === 'accepted') invitationBlocked('already_accepted');
    if (invitation.status === 'revoked') return { row: invitation, changed: false };
    if (invitation.status !== 'pending') invitationBlocked('not_pending');
    const result = await tx.query(
      "UPDATE invitations SET status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp() " +
      "WHERE business_id=$1 AND id=$2 AND status='pending'", [businessId, id],
    );
    return { row: await readManagedInvitation(tx, businessId, id), changed: result.rowCount > 0 };
  });
  if (changed) await auditInvitation('revoke', row, actorUserId);
  return toInvitationRow(row);
}

function assertActive(row: InvitationRecord): void {
  if (row.business_status !== 'active' || row.account_status !== 'active') {
    throw new AppError('BUSINESS_INACTIVE', 'Business inactive');
  }
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  const row = await readTokenInvitation(db, lookupDigest(token));
  assertUsable(row);
  assertActive(row);
  return {
    businessName: row.business_name, emailMasked: maskInvitationEmail(row.email), role: 'staff',
    expiresAt: row.expires_at.toISOString(), permissionsCount: effectivePermissions('staff', row.permissions).length,
  };
}

export async function acceptInvitation(userId: string, token: string, ex?: DbExecutor): Promise<{ businessId: string }> {
  const hash = lookupDigest(token);
  const accept = async (tx: DbExecutor) => {
    await lockInvitationKey(tx, 'tenancy-user:' + userId);
    const user = await tx.maybeOne<{ email_normalized: string; status: string }>(
      'SELECT email_normalized,status FROM users WHERE id=$1', [userId],
    );
    if (user?.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'Account is disabled');
    await lockInvitationKey(tx, inviteLock(user.email_normalized));
    const row = await lockTokenInvitation(tx, hash);
    assertUsable(row);
    assertActive(row);
    if (user.email_normalized !== row.email_normalized) {
      throw new AppError('PERMISSION_DENIED', 'Invitation belongs to a different email', { details: { reason: 'email_mismatch' } });
    }
    await assertSingleAccount(tx, userId, row.account_id, false);
    const member = await tx.query(
      "INSERT INTO memberships(business_id,user_id,role,permissions,status) VALUES($1,$2,'staff',$3,'active') " +
      "ON CONFLICT(business_id,user_id) DO UPDATE SET status='active',role='staff',permissions=EXCLUDED.permissions," +
      "updated_at=clock_timestamp() WHERE memberships.status='revoked'",
      [row.business_id, userId, effectivePermissions('staff', row.permissions)],
    );
    if (!member.rowCount) invitationBlocked('already_member');
    const accepted = await tx.query(
      "UPDATE invitations SET status='accepted',accepted_by=$3,accepted_at=clock_timestamp(),updated_at=clock_timestamp() " +
      "WHERE business_id=$1 AND id=$2 AND status='pending' AND expires_at>clock_timestamp()",
      [row.business_id, row.id, userId],
    );
    if (!accepted.rowCount) invitationBlocked('expired');
    await tx.query(
      "UPDATE invitations i SET status='revoked',revoked_at=clock_timestamp(),updated_at=clock_timestamp() " +
      "FROM businesses b WHERE i.business_id=b.id AND b.account_id<>$1 AND i.email_normalized=$2 AND i.status='pending'",
      [row.account_id, user.email_normalized],
    );
    return row;
  };
  const row = ex ? await accept(ex) : await db.tx(accept);
  if (!ex) await announceAcceptance(userId, row);
  return { businessId: row.business_id };
}

// F02 calls this once after its signup transaction commits.
export async function completeInvitationAcceptance(userId: string, token: string): Promise<void> {
  try {
    const hash = lookupDigest(token);
    const accepted = await db.maybeOne<{ id: string }>(
      "SELECT id FROM invitations WHERE token_hash=$1 AND status='accepted' AND accepted_by=$2", [hash, userId],
    );
    if (!accepted) return;
    await announceAcceptance(userId, await readTokenInvitation(db, hash));
  } catch {
    log.error({ userId }, 'Invitation acceptance completion failed');
  }
}

async function announceAcceptance(userId: string, row: InvitationRecord): Promise<void> {
  try {
    await auditInvitation('accept', row, userId, { userId, businessId: row.business_id });
  } catch {
    log.error({ businessId: row.business_id, invitationId: row.id }, 'Invitation acceptance audit failed');
  }
  try {
    await publish(row.business_id, {
      type: 'custom', featureId: 'F03', name: 'tenancy.membership.changed', data: { userId },
    }, { userIds: [userId] });
    await notify({
      businessId: row.business_id, to: { role: 'owners' }, type: 'invitation',
      title: row.language === 'th' ? 'พนักงานใหม่เข้าร่วมแล้ว' : 'A new staff member joined',
      body: maskInvitationEmail(row.email), link: '/members', dedupKey: 'invite-accepted:' + row.id,
    });
  } catch {
    log.warn({ businessId: row.business_id, invitationId: row.id }, 'Invitation acceptance notification failed');
  }
}

export async function declineInvitation(token: string): Promise<void> {
  const hash = lookupDigest(token);
  const row = await db.tx(async (tx) => {
    const invitation = await lockTokenInvitation(tx, hash);
    assertUsable(invitation);
    const result = await tx.query(
      "UPDATE invitations SET status='declined',updated_at=clock_timestamp() " +
      "WHERE business_id=$1 AND id=$2 AND status='pending' AND expires_at>clock_timestamp()",
      [invitation.business_id, invitation.id],
    );
    if (!result.rowCount) invitationBlocked('expired');
    return invitation;
  });
  await auditInvitation('decline', row, null);
}

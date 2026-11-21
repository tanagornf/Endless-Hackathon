import { STAFF_DEFAULT_PERMISSIONS } from '@nless/shared/core/permissions';
import type { MembershipRole } from '@nless/shared/core/permissions';
import type { MemberRow } from '@nless/shared/features/tenancy/types';
import { z } from 'zod';
import { AppError, audit, db, publish } from '../../core';
import type { DbExecutor } from '../../core';
import { effectivePermissions, validatePermissionKeys } from './permissions';

type MemberRecord = Omit<MemberRow, 'permissions' | 'lastSeenAt' | 'createdAt'> & {
  permissions: string[];
  lastSeenAt: Date | null;
  createdAt: Date;
};

const memberQuery =
  'SELECT m.user_id AS "userId", u.email, u.display_name AS "displayName", m.role, m.status, m.permissions, ' +
  '(a.owner_user_id=m.user_id) AS "isAccountOwner", (m.user_id=$2) AS "isSelf", ' +
  '(SELECT max(s.last_seen_at) FROM sessions s WHERE s.user_id=m.user_id) AS "lastSeenAt", ' +
  'm.created_at AS "createdAt" FROM memberships m JOIN users u ON u.id=m.user_id ' +
  'JOIN businesses b ON b.id=m.business_id JOIN accounts a ON a.id=b.account_id WHERE m.business_id=$1';

const userIdSchema = z.guid();

function toMemberRow(row: MemberRecord): MemberRow {
  return {
    ...row,
    permissions: effectivePermissions(row.role, row.permissions),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listMembers(businessId: string, actorUserId: string): Promise<{ items: MemberRow[] }> {
  const { rows } = await db.query<MemberRecord>(
    memberQuery + " ORDER BY (m.role='owner') DESC, m.status, lower(u.display_name), m.user_id",
    [businessId, actorUserId],
  );
  return { items: rows.map(toMemberRow) };
}

type MembershipChange =
  | { action: 'permissions'; permissions: string[] }
  | { action: 'role'; role: MembershipRole; permissions?: string[] }
  | { action: 'revoke' }
  | { action: 'restore' };

function blocked(reason: string): never {
  throw new AppError('POLICY_BLOCKED', 'Membership change is not allowed', { details: { reason } });
}

async function readMember(ex: DbExecutor, businessId: string, actorUserId: string, targetUserId: string) {
  const member = await ex.maybeOne<MemberRecord>(memberQuery + ' AND m.user_id=$3', [businessId, actorUserId, targetUserId]);
  if (!member) throw new AppError('NOT_FOUND', 'Membership not found');
  return member;
}

async function assertOtherActiveOwner(ex: DbExecutor, businessId: string, targetUserId: string) {
  const { exists } = await ex.one<{ exists: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM memberships WHERE business_id=$1 AND user_id<>$2 AND role='owner' AND status='active')",
    [businessId, targetUserId],
  );
  if (!exists) blocked('last_owner');
}

export async function changeMember(
  businessId: string, actorUserId: string, targetUserId: string, change: MembershipChange,
): Promise<MemberRow> {
  if (!userIdSchema.safeParse(targetUserId).success) throw new AppError('NOT_FOUND', 'Membership not found');
  const updated = await db.tx(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['tenancy:' + businessId]);
    const actor = await tx.maybeOne<{ role: MembershipRole }>(
      "SELECT role FROM memberships WHERE business_id=$1 AND user_id=$2 AND status='active'",
      [businessId, actorUserId],
    );
    if (!actor) throw new AppError('NOT_FOUND', 'Business not found');
    if (actor.role !== 'owner') throw new AppError('PERMISSION_DENIED', 'Permission required');

    const current = await readMember(tx, businessId, actorUserId, targetUserId);
    if (current.isSelf) blocked('self_change');
    if (current.isAccountOwner) blocked('account_owner');
    const removingOwner = change.action === 'revoke' || (change.action === 'role' && change.role === 'staff');
    if (current.role === 'owner' && current.status === 'active' && removingOwner) {
      await assertOtherActiveOwner(tx, businessId, targetUserId);
    }

    let { role, status, permissions } = current;
    const details: Record<string, unknown> = { userId: targetUserId };
    switch (change.action) {
      case 'permissions': {
        if (role !== 'staff') blocked('target_is_owner');
        permissions = validatePermissionKeys(change.permissions);
        details.before = effectivePermissions(role, current.permissions);
        details.after = permissions;
        break;
      }
      case 'role': {
        if (role === change.role) return { member: toMemberRow(current), details: null };
        if (change.permissions !== undefined) validatePermissionKeys(change.permissions);
        details.from = role;
        role = change.role;
        details.to = role;
        permissions = role === 'staff' ? validatePermissionKeys(change.permissions ?? STAFF_DEFAULT_PERMISSIONS) : [];
        break;
      }
      case 'revoke': {
        if (status === 'revoked') return { member: toMemberRow(current), details: null };
        status = 'revoked';
        break;
      }
      case 'restore': {
        if (status !== 'revoked') blocked('not_revoked');
        status = 'active';
        break;
      }
    }
    await tx.query(
      'UPDATE memberships SET role=$3, status=$4, permissions=$5, updated_at=now() WHERE business_id=$1 AND user_id=$2',
      [businessId, targetUserId, role, status, permissions],
    );
    return { member: toMemberRow(await readMember(tx, businessId, actorUserId, targetUserId)), details };
  });

  if (updated.details) {
    await audit({
      action: 'tenancy.member.' + change.action, businessId, actorUserId,
      targetType: 'membership', targetId: targetUserId, details: updated.details,
    });
    publish(businessId, {
      type: 'custom', featureId: 'F03', name: 'tenancy.membership.changed', data: { userId: targetUserId },
    }, { userIds: [targetUserId] });
  }
  return updated.member;
}

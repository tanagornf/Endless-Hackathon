import { createHmac, randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { PERMISSIONS } from '@nless/shared/core/permissions';
import type { MembershipRole, PermissionKey } from '@nless/shared/core/permissions';
import type { AuthScope, AuthUser, BusinessRecord } from '@nless/shared/core/types';
import { audit } from './audit';
import { config } from './config';
import { db } from './db';
import { AppError } from './errors';
import { requestContext } from './log';
import type { BusinessContext, DbExecutor } from './types';

export const SESSION_COOKIE = 'nless_session';
const cookie = { httpOnly: true, sameSite: 'lax', secure: config.COOKIE_SECURE, path: '/' } as const;
const tokenHash = (value: string) => createHmac('sha256', config.SESSION_SECRET).update(value).digest('hex');
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

export async function getUser(req: Request): Promise<AuthUser> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length !== 43) throw new AppError('AUTH_REQUIRED', 'Sign in required');
  const user = await db.maybeOne<AuthUser>(`
    SELECT u.id, u.email, u.display_name AS "displayName", u.status, u.is_platform_admin AS "isPlatformAdmin",
           u.locale, s.kind AS "sessionKind"
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [tokenHash(token)]);
  if (!user) throw new AppError('AUTH_REQUIRED', 'Sign in required');
  if (user.status !== 'active') throw new AppError('ACCOUNT_DISABLED', 'Account disabled');
  const context = requestContext.getStore();
  if (context) context.userId = user.id;
  return user;
}

export async function createSession(userId: string, kind: 'dev' | 'password' | 'oauth', res: Response): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const lifetime = kind === 'dev' && config.NODE_ENV === 'production' ? Math.min(config.SESSION_TTL_HOURS, 2) : config.SESSION_TTL_HOURS;
  const maxAge = 3600000 * lifetime;
  await db.query('INSERT INTO sessions (user_id,token_hash,kind,expires_at) VALUES ($1,$2,$3,$4)', [
    userId, tokenHash(token), kind, new Date(Date.now() + maxAge),
  ]);
  await audit({ action: 'core.session.create', actorUserId: userId, details: { kind } });
  res.cookie(SESSION_COOKIE, token, { ...cookie, maxAge });
}

export async function destroySession(req: Request, res: Response): Promise<void> {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && token.length === 43) {
    await db.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [tokenHash(token)]);
  }
  res.clearCookie(SESSION_COOKIE, cookie);
}

/** Revoke active sessions on the same executor as the caller's credential update. */
export async function revokeUserSessionsInTransaction(tx: DbExecutor, userId: string): Promise<number> {
  const result = await tx.query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()', [userId]);
  return result.rowCount;
}

export async function revokeUserSessions(userId: string): Promise<number> {
  return revokeUserSessionsInTransaction(db, userId);
}

const membershipSql = `
  SELECT b.id, b.account_id AS "accountId", b.name, b.status, b.timezone, b.language, b.version,
         a.status AS "accountStatus", m.role, m.permissions AS "grants"
  FROM memberships m JOIN businesses b ON b.id = m.business_id JOIN accounts a ON a.id = b.account_id
  WHERE m.user_id = $1 AND m.status = 'active'`;

type MembershipRow = BusinessRecord & { accountStatus: string; role: MembershipRole; grants: string[] };
const permissionKeys = Object.keys(PERMISSIONS) as PermissionKey[];
function memberView({ accountStatus: _status, role, grants, ...business }: MembershipRow) {
  const allowed = role === 'owner' ? permissionKeys : permissionKeys.filter((key) => PERMISSIONS[key].staff !== 'never' && grants.includes(key));
  return { business, role, permissions: [...allowed] };
}
export async function listBusinesses(userId: string) {
  const { rows } = await db.query<MembershipRow>(membershipSql + " AND b.status = 'active' AND a.status = 'active' ORDER BY b.name, b.id", [userId]);
  return rows.map(memberView);
}

export async function getBusiness(req: Request, businessId?: string): Promise<BusinessContext> {
  const user = await getUser(req);
  const id = businessId ?? req.params.businessId;
  if (typeof id !== 'string' || !uuid.test(id)) throw new AppError('NOT_FOUND', 'Business not found');
  const row = await db.maybeOne<MembershipRow>(membershipSql + ' AND b.id = $2', [user.id, id]);
  if (!row) throw new AppError('NOT_FOUND', 'Business not found');
  if (row.status !== 'active' || row.accountStatus !== 'active') throw new AppError('BUSINESS_INACTIVE', 'Business is inactive');
  const { business, role, permissions } = memberView(row);
  const trace = requestContext.getStore();
  if (trace) trace.businessId = id;
  return { business, user, scope: { businessId: id, accountId: business.accountId, userId: user.id, role, permissions, isPlatformAdmin: user.isPlatformAdmin } };
}

export function requirePermission(scope: AuthScope, key: PermissionKey): void {
  if (!scope.permissions.includes(key)) throw new AppError('PERMISSION_DENIED', 'Permission required');
}

export function requirePlatformAdmin(user: AuthUser): void {
  if (!user.isPlatformAdmin) throw new AppError('PERMISSION_DENIED', 'Platform admin permission required');
}

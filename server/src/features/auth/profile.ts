import type { Request } from 'express';
import { z } from 'zod';
import type { AuthStatus } from '@nless/shared/features/auth/types';
import { auditInTransaction, db } from '../../core';
import { assertSameOriginRequest } from './csrf';

const ProfileBody = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  locale: z.enum(['th', 'en']).optional(),
}).strict();

const statusColumns = `id AS "userId", email, display_name AS "displayName", locale,
  email_verified_at IS NOT NULL AS "emailVerified", is_platform_admin AS "isPlatformAdmin"`;

export function readAuthStatus(userId: string): Promise<AuthStatus> {
  return db.one<AuthStatus>(`SELECT ${statusColumns} FROM users WHERE id = $1`, [userId]);
}

export async function updateProfile(req: Request, userId: string, input: unknown): Promise<AuthStatus> {
  assertSameOriginRequest(req);
  const { displayName, locale } = ProfileBody.parse(input);
  if (displayName === undefined && locale === undefined) return readAuthStatus(userId);
  return db.tx(async (tx) => {
    const result = await tx.one<AuthStatus>(
      `UPDATE users SET display_name = COALESCE($2, display_name), locale = COALESCE($3, locale)
       WHERE id = $1 RETURNING ${statusColumns}`, [userId, displayName ?? null, locale ?? null],
    );
    await auditInTransaction(tx, [{ action: 'auth.profile.update', actorUserId: userId }]);
    return result;
  });
}

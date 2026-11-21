import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError, config } from '../../core';
import type { DbExecutor } from '../../core';

export const authTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{40,64}$/);
type Purpose = 'verify_email' | 'reset_password';

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function issueToken(userId: string, purpose: Purpose, tx: DbExecutor): Promise<string> {
  // Keep issuance and consumption in the same lock order, starting with the user.
  await tx.one('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const token = randomBytes(32).toString('base64url');
  await tx.query(
    'UPDATE auth_tokens SET used_at = statement_timestamp() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL',
    [userId, purpose],
  );
  await tx.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, statement_timestamp() + make_interval(mins => $4))`,
    [userId, purpose, hashToken(token), config.AUTH_TOKEN_TTL_MINUTES],
  );
  return token;
}

export async function consumeToken(token: string, purpose: Purpose, tx: DbExecutor): Promise<string> {
  const hash = hashToken(token);
  const owner = await tx.maybeOne(
    `SELECT u.id FROM auth_tokens AS t JOIN users AS u ON u.id = t.user_id
     WHERE t.token_hash = $1 AND t.purpose = $2 FOR UPDATE OF u`, [hash, purpose],
  );
  if (!owner) throw new AppError('NOT_FOUND', 'Link not found');

  const used = await tx.maybeOne<{ user_id: string }>(
    `UPDATE auth_tokens SET used_at = statement_timestamp() WHERE token_hash = $1 AND purpose = $2
     AND used_at IS NULL AND expires_at > statement_timestamp() RETURNING user_id`, [hash, purpose],
  );
  if (used) return used.user_id;

  const state = await tx.one<{ consumed: boolean }>(
    'SELECT used_at IS NOT NULL AS consumed FROM auth_tokens WHERE token_hash = $1 AND purpose = $2', [hash, purpose],
  );
  throw new AppError('POLICY_BLOCKED', 'Link is unavailable', { details: { reason: state.consumed ? 'used' : 'expired' } });
}

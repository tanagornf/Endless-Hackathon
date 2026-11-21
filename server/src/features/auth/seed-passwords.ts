import { createHmac } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { config, db, log } from '../../core';
import { hashPassword } from './password';
import { revokeAllSessions } from './sessions-port';

export const seedUserIds = SEED.users.map(({ id }) => id);

export async function syncSeedPasswords(): Promise<void> {
  const password = config.SEED_USER_PASSWORD;
  if (password.length < 12) {
    log.warn('seed password not set');
    return;
  }
  const fingerprint = createHmac('sha256', config.SESSION_SECRET).update(password).digest('hex');
  let synced = 0;
  for (const id of seedUserIds) {
    const change = await db.tx(async (tx) => {
      // A user row exists independently of the fingerprint and serializes first-time setup too.
      if (!await tx.maybeOne('SELECT id FROM users WHERE id = $1 FOR UPDATE', [id])) return null;
      const prior = await tx.maybeOne<{ fingerprint: string }>(
        'SELECT fingerprint FROM auth_seed_password_state WHERE user_id = $1', [id],
      );
      if (prior?.fingerprint === fingerprint) return null;
      const hash = await hashPassword(password);
      await tx.query(
        'UPDATE users SET password_hash = $1, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $2',
        [hash, id],
      );
      if (!prior) {
        await tx.query('INSERT INTO auth_seed_password_state (user_id, fingerprint) VALUES ($1, $2)', [id, fingerprint]);
      }
      return { hash, prior: prior?.fingerprint };
    });

    if (!change) continue;
    if (change.prior) {
      // Release the transaction connection before calling core. An incomplete rotation is retried
      // on boot because the fingerprint only advances after session revocation succeeds.
      await revokeAllSessions(id);
      await db.query(
        `UPDATE auth_seed_password_state AS state SET fingerprint = $2, updated_at = now()
         FROM users WHERE state.user_id = $1 AND state.fingerprint = $3
           AND users.id = state.user_id AND users.password_hash = $4`,
        [id, fingerprint, change.prior, change.hash],
      );
    }
    synced++;
  }
  if (synced) log.info('seed passwords synced: ' + synced);
}

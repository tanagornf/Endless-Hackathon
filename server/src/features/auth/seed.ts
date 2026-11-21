import type { FeatureSeed, SeedContext } from '../../core';
import { seedUserIds, syncSeedPasswords } from './seed-passwords';

export default {
  featureId: 'F02',
  dependsOn: ['core', 'tenancy'],
  async run({ db }) {
    await syncSeedPasswords();
    await db.query(
      'UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ANY($1::uuid[])',
      [seedUserIds],
    );
  },
} satisfies FeatureSeed;

export async function resetDemo({ db, fixtures }: SeedContext) {
  await db.query('DELETE FROM auth_login_attempts WHERE email_normalized = ANY($1::text[])', [
    fixtures.users.map(({ email }) => email.trim().toLowerCase()),
  ]);
  await db.query("DELETE FROM email_outbox WHERE to_email_normalized LIKE '%@example.test'");
}

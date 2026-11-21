import { db } from '../../core';
import type { ScheduleDefinition } from '../../core';

export const outboxPurge: ScheduleDefinition = {
  name: 'auth.outbox-purge',
  everySeconds: 3600,
  async handler() {
    await db.tx(async (tx) => {
      await tx.query('DELETE FROM email_outbox WHERE expires_at < now()');
      await tx.query("DELETE FROM auth_tokens WHERE expires_at < now() - interval '7 days'");
      await tx.query(`DELETE FROM auth_login_attempts
        WHERE updated_at < now() - interval '1 day' AND (locked_until IS NULL OR locked_until < now())`);
    });
  },
};

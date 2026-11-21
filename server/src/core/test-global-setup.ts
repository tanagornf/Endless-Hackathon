import { config } from './config';
import { assertSafeDbName, closeDb, db, dbUrl } from './db';
import { migrate } from './migrate';
import { seed } from './seed';

export default async function globalSetup() {
  const database = decodeURIComponent(new URL(dbUrl()).pathname.slice(1));
  assertSafeDbName(database);
  if (config.NODE_ENV !== 'test' || !database.endsWith('_test') ||
      (process.env.CI !== 'true' && database !== 'nless_hack_' + config.LANE.toLowerCase() + '_test')) {
    throw new Error('Integration setup requires the current lane test database');
  }
  try {
    await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
    await migrate();
    await seed();
  } finally { await closeDb(); }
}

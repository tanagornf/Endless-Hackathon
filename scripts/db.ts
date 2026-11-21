import pg from 'pg';
import { AppError } from '../server/src/core/errors';
import { config } from '../server/src/core/config';
import { assertSafeDbName, closeDb, db, dbUrl } from '../server/src/core/db';
import { migrate } from '../server/src/core/migrate';
import { seed } from '../server/src/core/seed';

const databaseName = (url: URL) => decodeURIComponent(url.pathname.slice(1));
export async function createDatabases(urls: readonly string[]): Promise<void> {
  for (const connectionString of urls) {
    const target = new URL(connectionString);
    const name = databaseName(target);
    assertSafeDbName(name);
    const admin = new URL(target);
    admin.pathname = '/postgres';
    console.log('Configure database ' + target.hostname + '/' + name);
    const server = new pg.Client({ connectionString: admin.href, connectionTimeoutMillis: 10000 });
    try {
      await server.connect();
      const exists = await server.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
      if (!exists.rowCount) {
        try {
          await server.query('CREATE DATABASE "' + name + '"');
        } catch (error) {
          if (!['42P04', '23505'].includes((error as { code?: string }).code ?? '')) throw error;
        }
      }
    } finally {
      await server.end();
    }
    const client = new pg.Client({ connectionString: target.href, connectionTimeoutMillis: 10000 });
    try {
      await client.connect();
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    } finally {
      await client.end();
    }
  }
}

export async function runDbCommand(command: string, demo: boolean) {
  const url = new URL(dbUrl());
  const name = databaseName(url);
  if (config.NODE_ENV !== 'production' || command === 'create' || command === 'reset') assertSafeDbName(name);
  console.log(command + ' ' + url.hostname + '/' + name);
  switch (command) {
    case 'create': {
      const test = new URL(config.TEST_DATABASE_URL || url);
      if (!config.TEST_DATABASE_URL) test.pathname += '_test';
      await createDatabases([url.href, test.href]);
      break;
    }
    case 'reset':
      await db.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
      await migrate();
      await seed();
      break;
    case 'migrate':
      console.log('Applied migrations: ' + await migrate());
      break;
    case 'seed':
      await seed();
      if (demo) await (await import('../server/src/core/demo')).seedDemoData();
      break;
    case 'demo-reset':
      await (await import('../server/src/core/demo')).resetDemoData();
      break;
    default:
      throw new AppError('VALIDATION_ERROR', 'Use create, migrate, seed, reset or demo-reset');
  }
}
if (import.meta.main) {
  try {
    await runDbCommand(process.argv[2] ?? '', process.argv.includes('--demo'));
  } catch (error) {
    const code = (error as { code?: string }).code ?? 'SETUP_ERROR';
    console.error('Database command failed (' + code + ')' + (error instanceof AppError ? ': ' + error.message : ''));
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

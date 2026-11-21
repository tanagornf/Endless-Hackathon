import pg from 'pg';
import pgvector from 'pgvector/pg';
import { config } from './config';
import { AppError } from './errors';
import { log } from './log';
import type { DbClient, DbExecutor, QueryResult } from './types';

export function assertSafeDbName(name: string): void {
  if (!/^nless_hack_[a-c][0-3](_test)?$/.test(name)) throw new Error('Unsupported lane database name');
}

export function dbUrl(): string {
  const url = config.NODE_ENV === 'test' ? config.TEST_DATABASE_URL : config.DATABASE_URL;
  if (!url) throw new Error(config.NODE_ENV === 'test' ? 'TEST_DATABASE_URL is required' : 'DATABASE_URL is required');
  return url;
}

let pool: pg.Pool | undefined;
export function dbPool(): pg.Pool {
  if (pool) return pool;
  pool = new pg.Pool({
    connectionString: dbUrl(),
    connectionTimeoutMillis: 10000,
    statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
    max: config.DB_POOL_MAX,
    async onConnect(client) {
      try {
        await pgvector.registerTypes(client);
      } catch (error) {
        // A fresh database can open a connection before 001_core installs vector.
        if (!(error instanceof Error) || error.message !== 'vector type not found in the database') throw error;
      }
    },
  });
  pool.on('error', () => log.warn('Idle database connection closed'));
  return pool;
}

export async function closeDb(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}

type Runner = pg.Pool | pg.Client;
function executor(runner: () => Runner): DbExecutor {
  const query: DbExecutor['query'] = async <T>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>> => {
    const result = await runner().query(sql, params ? [...params] : undefined);
    return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
  };
  return {
    query,
    async one<T>(sql: string, params?: readonly unknown[]) {
      const { rows } = await query<T>(sql, params);
      if (rows.length !== 1) throw new AppError('NOT_FOUND', 'Expected one record');
      return rows[0];
    },
    async maybeOne<T>(sql: string, params?: readonly unknown[]) {
      const { rows } = await query<T>(sql, params);
      return rows[0] ?? null;
    },
  };
}

export const databaseExecutor = (client: pg.Client): DbExecutor => executor(() => client);

export const db: DbClient = {
  ...executor(dbPool),
  async tx(fn) {
    const client = await dbPool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(executor(() => client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  },
  async withAdvisoryLock(key, fn) {
    const client = await dbPool().connect();
    let locked = false;
    let destroy = false;
    try {
      await client.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
      locked = true;
      return await fn();
    } finally {
      if (locked) await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]).catch(() => { destroy = true; });
      client.release(destroy);
    }
  },
  toVector(values) {
    if (values.some((value) => !Number.isFinite(value))) throw new AppError('VALIDATION_ERROR', 'Vector values must be finite');
    return pgvector.toSql([...values])!;
  },
};

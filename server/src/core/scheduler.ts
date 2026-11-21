import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';
import { config } from './config';
import { databaseExecutor, db, dbUrl } from './db';
import { enqueueJob, notifyJobEnqueued, registerSchedule, registeredSchedules } from './jobs';
import { log } from './log';

const TICK_MS = 10_000;
const LOCK_RETRY_MS = 30_000;
const LOCK = "hashtext('nless.scheduler')";

const createLeadershipClient = () => new pg.Client({
  connectionString: dbUrl(), connectionTimeoutMillis: 10_000, statement_timeout: config.DB_STATEMENT_TIMEOUT_MS,
});

export class Scheduler {
  private client?: pg.Client;
  holdsLock = false;
  lastTickAt: string | null = null;
  observedOtherAt: string | null = null;

  constructor(private readonly makeClient = createLeadershipClient) {}

  async acquire(): Promise<boolean> {
    if (this.client) return this.holdsLock;
    const client = this.makeClient();
    this.client = client;
    client.on('error', () => { if (this.client === client) this.holdsLock = false; });
    try {
      await client.connect();
      const result = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(' + LOCK + ') AS locked');
      this.holdsLock = result.rows[0]?.locked === true;
      if (this.holdsLock) {
        this.observedOtherAt = null;
        log.info('Scheduler acquired leadership');
      } else {
        this.observedOtherAt = new Date().toISOString();
        log.info('Scheduler lock held by another instance');
        await this.release();
      }
      return this.holdsLock;
    } catch (error) {
      await this.release();
      throw error;
    }
  }

  async tickOnce(now = new Date()): Promise<void> {
    const client = this.client;
    if (!client || !this.holdsLock) return;
    const executor = databaseExecutor(client);
    try {
      await client.query('SELECT 1');
      for (const schedule of registeredSchedules()) {
        if (!this.holdsLock) return;
        const pending = await client.query("SELECT 1 FROM jobs WHERE type=$1 AND state IN ('queued','running') LIMIT 1", [schedule.name]);
        if (!this.holdsLock) return;
        if (pending.rowCount) {
          log.debug({ schedule: schedule.name }, 'Schedule overlap skipped');
          continue;
        }
        const intervalMs = schedule.everySeconds * 1000;
        const slot = new Date(Math.floor(now.valueOf() / intervalMs) * intervalMs).toISOString();
        const options = { dedupKey: schedule.name + '@' + slot, lockKey: 'schedule:' + schedule.name, maxAttempts: 3 };
        const job = await enqueueJob(executor, schedule.name, { slot }, options);
        notifyJobEnqueued(schedule.name, job, options);
      }
      this.lastTickAt = now.toISOString();
    } catch (error) {
      await this.release();
      throw error;
    }
  }

  async release(): Promise<void> {
    const client = this.client;
    const held = this.holdsLock;
    this.holdsLock = false;
    this.client = undefined;
    if (!client) return;
    if (held) await client.query('SELECT pg_advisory_unlock(' + LOCK + ')').catch(() => {});
    await client.end().catch(() => {});
  }
}

export function registerCoreSchedules(): void {
  registerSchedule({
    name: 'core.sessions.purge', everySeconds: 3600,
    async handler() { await db.query('DELETE FROM sessions WHERE expires_at < now()'); },
  }, 'F01');
  registerSchedule({
    name: 'core.jobs.purge', everySeconds: 3600,
    async handler() {
      const { rowCount } = await db.query(`
        WITH stale AS (
          SELECT id FROM jobs WHERE (state IN ('succeeded','cancelled') AND finished_at < now() - interval '7 days')
            OR (state='dead' AND finished_at < now() - interval '30 days')
          ORDER BY finished_at LIMIT 5000 FOR UPDATE SKIP LOCKED
        ) DELETE FROM jobs j USING stale WHERE j.id=stale.id`);
      return { result: { deleted: rowCount } };
    },
  }, 'F35');
}

let active: { instance: Scheduler; controller: AbortController; finished: Promise<void> } | undefined;

async function run(instance: Scheduler, signal: AbortSignal): Promise<void> {
  while (!signal.aborted) {
    try {
      await instance.acquire();
      while (!signal.aborted && instance.holdsLock) {
        await instance.tickOnce();
        await sleep(TICK_MS, undefined, { signal });
      }
    } catch {
      if (!signal.aborted) log.warn('Scheduler will retry');
    } finally { await instance.release(); }
    if (!signal.aborted) await sleep(LOCK_RETRY_MS, undefined, { signal }).catch(() => {});
  }
}

export function startScheduler(): void {
  if (active) return;
  const instance = new Scheduler();
  const controller = new AbortController();
  active = { instance, controller, finished: run(instance, controller.signal) };
}

export function schedulerState() {
  return {
    enabled: config.RUN_SCHEDULER, holdsLock: active?.instance.holdsLock ?? false,
    lastTickAt: active?.instance.lastTickAt ?? null, observedOtherAt: active?.instance.observedOtherAt ?? null,
  };
}

export async function stopScheduler(): Promise<void> {
  const current = active;
  if (!current) return;
  current.controller.abort();
  try { await current.finished; }
  finally { if (active === current) active = undefined; }
}

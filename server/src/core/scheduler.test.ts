import { afterAll, expect, test } from 'vitest';
import { closeDb, db } from './db';
import { EXPECTED_SCHEDULES } from './expected-schedules';
import { getJobHandler, jobs, registerSchedule, registeredSchedules } from './jobs';
import { registerCoreSchedules, Scheduler } from './scheduler';

afterAll(closeDb);

test('scheduler deduplicates slots, skips overlap and transfers leadership', async () => {
  const name = 'test.scheduler-slot';
  registerSchedule({ name, everySeconds: 60, handler: async () => {} }, 'F35');
  const first = new Scheduler();
  const second = new Scheduler();
  const slot = new Date('2026-11-21T12:00:00.000Z');
  const next = new Date(slot.getTime() + 60_000);
  const scheduled = () => db.query('SELECT dedup_key,payload,lock_key,max_attempts FROM jobs WHERE type=$1 ORDER BY dedup_key', [name]);
  try {
    expect(await first.acquire()).toBe(true);
    expect(first.holdsLock).toBe(true);
    expect(await second.acquire()).toBe(false);
    expect(second.observedOtherAt).not.toBeNull();
    await second.tickOnce(slot);
    expect((await scheduled()).rowCount).toBe(0);

    await first.tickOnce(slot);
    await first.tickOnce(slot);
    await first.tickOnce(next);
    expect((await scheduled()).rows).toEqual([{
      dedup_key: name + '@' + slot.toISOString(), payload: { slot: slot.toISOString() },
      lock_key: 'schedule:' + name, max_attempts: 3,
    }]);
    expect(first.lastTickAt).toBe(next.toISOString());

    await db.query("UPDATE jobs SET state='succeeded',finished_at=now() WHERE type=$1", [name]);
    await first.tickOnce(slot);
    expect((await scheduled()).rowCount).toBe(1);
    await first.release();
    expect(first.holdsLock).toBe(false);
    expect(await second.acquire()).toBe(true);
    await second.tickOnce(next);
    expect((await scheduled()).rowCount).toBe(2);
  } finally {
    await Promise.all([first.release(), second.release()]);
    await db.query('DELETE FROM jobs WHERE type=$1', [name]);
  }
}, 20_000);

test('schedule registrations validate interval and report the owners on duplicate names', () => {
  const handler = async () => {};
  expect(() => registerSchedule({ name: 'test.scheduler-invalid', everySeconds: 5, handler }, 'F35')).toThrow(/frequency/);
  expect(() => registerSchedule({ name: 'test.scheduler-invalid', everySeconds: 60.5, handler }, 'F35')).toThrow(/frequency/);
  registerSchedule({ name: 'test.scheduler-duplicate', everySeconds: 600, handler }, 'F01');
  expect(() => registerSchedule({ name: 'test.scheduler-duplicate', everySeconds: 600, handler }, 'F35')).toThrow(/F01.*F35/);
});

test('core schedules match the declared catalog and purge only jobs beyond retention', async () => {
  registerCoreSchedules();
  for (const schedule of registeredSchedules().filter(({ name }) => name.startsWith('core.'))) {
    expect(EXPECTED_SCHEDULES).toContainEqual(expect.objectContaining({
      name: schedule.name, ownerFeature: schedule.ownerFeature, everySeconds: schedule.everySeconds,
    }));
  }
  const types = ['test.scheduler-retention-old', 'test.scheduler-retention-recent', 'test.scheduler-retention-queued'];
  const [old, recent, queued] = await Promise.all(types.map((type) => jobs.enqueue(type, {})));
  await db.query("UPDATE jobs SET state='succeeded',finished_at=now()-interval '8 days' WHERE id=$1", [old.jobId]);
  await db.query("UPDATE jobs SET state='dead',finished_at=now()-interval '29 days' WHERE id=$1", [recent.jobId]);
  const purge = getJobHandler('core.jobs.purge')!;
  await purge({ id: 'test', type: 'core.jobs.purge', businessId: null, attempt: 1, maxAttempts: 3,
    signal: new AbortController().signal, payload: { slot: new Date(0).toISOString() }, async progress() {} });
  expect(await jobs.get(old.jobId)).toBeNull();
  expect(await jobs.get(recent.jobId)).toMatchObject({ state: 'dead' });
  expect(await jobs.get(queued.jobId)).toMatchObject({ state: 'queued' });
  await db.query("UPDATE jobs SET state='cancelled',finished_at=now() WHERE id=$1", [queued.jobId]);
}, 15_000);

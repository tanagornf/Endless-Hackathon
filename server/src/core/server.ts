import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { createApp } from './app';
import { config } from './config';
import { closeDb } from './db';
import { registerCoreSchedules, startScheduler, stopScheduler } from './scheduler';
import { JOBS_SHUTDOWN_GRACE_MS } from './jobs-config';
import { log } from './log';
import { markDraining } from './meta';
import { attachRealtime } from './realtime';
import { startWorker, stopWorker } from './worker';

registerCoreSchedules();
const server = createServer(await createApp());
const closeRealtime = attachRealtime(server);
const port = config.PORT ?? config.API_PORT;
server.listen(port, '0.0.0.0', () => {
  log.info({ port, modelMode: config.MODEL_MODE }, 'Endless API is listening');
  if (config.RUN_WORKER) startWorker();
  if (config.RUN_SCHEDULER) startScheduler();
});

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  markDraining();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  closeRealtime(1001);
  await Promise.allSettled([
    stopWorker(),
    Promise.race([stopScheduler(), sleep(22000, undefined, { ref: false })]),
    Promise.race([closed, sleep(JOBS_SHUTDOWN_GRACE_MS + 2000, undefined, { ref: false })]),
  ]);
  server.closeAllConnections();
  await Promise.race([closeDb(), sleep(3000, undefined, { ref: false })]).catch(() => {});
  process.exit(0);
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

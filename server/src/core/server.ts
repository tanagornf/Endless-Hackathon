import { createServer } from 'node:http';
import { createApp } from './app';
import { config } from './config';
import { closeDb, db } from './db';
import { registerSchedule, startScheduler, startWorker, stopScheduler, stopWorker } from './jobs';
import { log } from './log';
import { attachRealtime } from './realtime';

registerSchedule({
  name: 'core.sessions.purge',
  everySeconds: 3600,
  async handler() { await db.query('DELETE FROM sessions WHERE expires_at < now()'); },
});
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
  closeRealtime();
  await Promise.all([stopWorker(), stopScheduler(), new Promise<void>((resolve) => server.close(() => resolve()))]);
  await closeDb();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });

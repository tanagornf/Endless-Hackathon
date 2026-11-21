import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import { config } from './config';

export const JOBS_CONCURRENCY = 4;
export const JOBS_LEASE_SECONDS = config.JOBS_LEASE_SECONDS;
export const JOBS_HEARTBEAT_MS = Math.floor(JOBS_LEASE_SECONDS * 1000 / 3);
export const JOBS_POLL_MS = config.JOBS_POLL_MS;
export const JOBS_MAX_RESCHEDULES = 500;
export const JOBS_SHUTDOWN_GRACE_MS = 20000;
export const JOBS_HANDLER_SOFT_TIMEOUT_MS = 120000;
export const JOBS_PAYLOAD_MAX_BYTES = 16384;
export const JOBS_RESULT_MAX_BYTES = 8192;
export const instanceId = [hostname(), process.pid, randomBytes(3).toString('hex')].join(':');

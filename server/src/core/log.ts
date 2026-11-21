import { AsyncLocalStorage } from 'node:async_hooks';
import pino from 'pino';
import { config } from './config';

export interface RequestLogContext {
  requestId: string;
  userId?: string;
  businessId?: string;
}
export const requestContext = new AsyncLocalStorage<RequestLogContext>();
export const jobContext = new AsyncLocalStorage<{ jobId: string; type: string }>();
const secretKeys = ['authorization', 'cookie', 'password', 'token', 'secret', 'apiKey', 'accessToken', 'clientSecret', 'refreshToken', 'slipImage', 'image', 'dataUrl', 'file_data', 'image_url'];
export const log = pino({
  level: config.LOG_LEVEL,
  mixin: () => ({ ...requestContext.getStore(), ...jobContext.getStore() }),
  redact: { paths: [...secretKeys, ...secretKeys.map((key) => '*.' + key), '["set-cookie"]', '*.["set-cookie"]'], censor: '[redacted]' },
});

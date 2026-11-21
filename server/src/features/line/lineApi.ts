import { z } from 'zod';
import { LINE_API } from './config';

export interface LineResponse {
  status: number;
  headers: Headers;
  body: unknown;
}

interface LineRequestOptions {
  token?: string;
  method?: 'GET' | 'POST';
  json?: unknown;
  form?: URLSearchParams;
  retryKey?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export function makeLineRequest(fetcher: typeof fetch = globalThis.fetch) {
  return async (path: string, options: LineRequestOptions = {}): Promise<LineResponse | null> => {
    const headers = new Headers();
    if (options.token) headers.set('Authorization', 'Bearer ' + options.token);
    if (options.retryKey) headers.set('X-Line-Retry-Key', options.retryKey);
    if (options.json !== undefined) headers.set('Content-Type', 'application/json');
    if (options.form) headers.set('Content-Type', 'application/x-www-form-urlencoded');
    const timeout = AbortSignal.timeout(options.timeoutMs ?? 3_000);
    try {
      const res = await fetcher(LINE_API + path, {
        method: options.method ?? 'GET', headers, redirect: 'error',
        body: options.json === undefined ? options.form : JSON.stringify(options.json),
        signal: options.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
      });
      const body: unknown = await res.json().catch(() => null);
      return { status: res.status, headers: res.headers, body };
    } catch {
      return null;
    }
  };
}
export const lineRequest = makeLineRequest();

const Reply = z.object({ message: z.string() });
export function lineErrorMessage(body: unknown): string {
  const result = Reply.safeParse(body);
  return result.success ? result.data.message : '';
}

import type { ApiFailure, ApiResult } from '@nless/shared/core/types';
import type { WebApiClient, WebApiError } from '@nless/shared/core/loader';

const base = import.meta.env.VITE_API_BASE || '/api/v1';
let selected: string | null = null;
export function setBusinessId(id: string | null) { selected = id; }

export function failureOf(status: number, message: string): ApiFailure {
  return { error: { code: status ? 'INTERNAL' : 'SERVICE_NOT_READY', message, retryable: status === 0 || status >= 500 },
    meta: { requestId: '', schemaVersion: 1, serverTime: new Date().toISOString() } };
}
function webError(status: number, failure: ApiFailure): WebApiError {
  return Object.assign(new Error(failure.error.message), failure.error, { status, failure });
}
export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('X-Requested-With', 'nless');
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  let response: Response;
  try { response = await fetch(path, { ...init, headers, credentials: 'include' }); }
  catch { throw webError(0, failureOf(0, 'Network unavailable')); }
  if (response.status === 204) return undefined as T;
  const result = await response.json().catch(() => null) as ApiResult<T> | ApiFailure | null;
  if (!response.ok) {
    if (response.status === 401 && !path.endsWith('/me') && typeof window !== 'undefined' && !/^\/(?:dev-login|login|signup)(?:\/|$)/.test(location.pathname)) {
      location.assign('/login');
    }
    throw webError(response.status, result && 'error' in result ? result : failureOf(response.status, response.statusText));
  }
  if (!result || !('data' in result)) throw webError(response.status, failureOf(response.status, 'Unexpected response'));
  return result.data;
}
const send = <T>(method: string, path: string, body?: unknown) => apiRequest<T>(base + path, {
  method, body: body === undefined ? undefined : JSON.stringify(body),
});
export const api: WebApiClient = {
  get(path, query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined) params.set(key, String(value));
    return send('GET', path + (params.size ? (path.includes('?') ? '&' : '?') + params.toString() : ''));
  },
  post: (path, body) => send('POST', path, body),
  put: (path, body) => send('PUT', path, body),
  patch: (path, body) => send('PATCH', path, body),
  delete: (path) => send('DELETE', path),
  upload: (path, form) => apiRequest(base + path, { method: 'POST', body: form }),
  biz(path) {
    if (!selected) throw webError(0, failureOf(0, 'Select a business first'));
    return '/businesses/' + encodeURIComponent(selected) + path;
  },
};

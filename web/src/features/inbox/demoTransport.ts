import type { DemoChatActionResult, DemoChatPoll, DemoChatSendResult } from '@nless/shared/features/inbox/types';
import { apiRequest } from '../../core';
import type { ReviewAction } from './MessageParts';

const base = import.meta.env.VITE_API_BASE || '/api/v1';

export function chatRequest<T>(path: string, init: RequestInit = {}, token?: string) {
  const headers = new Headers(init.headers);
  if (token) headers.set('X-Demo-Visitor', token);
  return apiRequest<T>(base + path, { ...init, headers, redirectOnUnauthorized: !path.startsWith('/public/') });
}

export function chatTransport(path: string, token?: string) {
  return {
    poll(after: string | null, waitMs: number, signal: AbortSignal) {
      const query = new URLSearchParams({ waitMs: String(waitMs) });
      if (after) query.set('after', after);
      return chatRequest<DemoChatPoll>(path + '/poll?' + query.toString(), { signal }, token);
    },
    send(text: string, clientRequestId: string) {
      return chatRequest<DemoChatSendResult>(path + '/messages', {
        method: 'POST', body: JSON.stringify({ text, clientRequestId }),
      }, token);
    },
    action(action: ReviewAction, clientRequestId: string) {
      return chatRequest<DemoChatActionResult>(path + '/actions', {
        method: 'POST', body: JSON.stringify({ ...action, clientRequestId }),
      }, token);
    },
    reset() {
      return chatRequest<{ ok: true }>(path + '/reset', { method: 'POST' }, token);
    },
    fileUrl(id: string) {
      return base + path + '/files/' + encodeURIComponent(id);
    },
  };
}

export type ChatTransport = ReturnType<typeof chatTransport>;

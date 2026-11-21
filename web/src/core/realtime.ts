import { useEffect, useRef } from 'react';
import type { RealtimeEvent } from '@nless/shared/core/types';
import { useSession } from './session';

const listeners = new Set<(event: RealtimeEvent) => void>();
export function useRealtimeConnection() {
  const { currentBusiness } = useSession();
  useEffect(() => {
    if (!currentBusiness) return;
    let ready = true;
    let socket: WebSocket | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      if (!ready) return;
      const url = new URL(import.meta.env.VITE_WS_PATH || '/ws', window.location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(url);
      socket.onopen = () => socket?.send(JSON.stringify({ type: 'subscribe', businessId: currentBusiness.id }));
      socket.onmessage = ({ data }) => {
        try {
          const event = JSON.parse(data) as RealtimeEvent & { businessId: string };
          if (event.businessId === currentBusiness.id) for (const callback of listeners) callback(event);
        } catch { /* ignore invalid events */ }
      };
      socket.onclose = () => { if (ready) timer = setTimeout(connect, 3000); };
    };
    connect();
    return () => { ready = false; clearTimeout(timer); socket?.close(); };
  }, [currentBusiness?.id]);
}
export function useRealtime<T extends RealtimeEvent['type']>(type: T, handler: (event: Extract<RealtimeEvent, { type: T }>) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const callback = (event: RealtimeEvent) => { if (event.type === type) latest.current(event as Extract<RealtimeEvent, { type: T }>); };
    listeners.add(callback);
    return () => { listeners.delete(callback); };
  }, [type]);
}

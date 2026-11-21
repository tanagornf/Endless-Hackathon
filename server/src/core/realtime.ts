import type { Server, IncomingMessage } from 'node:http';
import type { Request } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type { RealtimeEvent } from '@nless/shared/core/types';
import { getBusiness, getUser } from './auth';
import { config } from './config';

interface Subscriber {
  socket: WebSocket;
  request: Request;
  userId: string;
  businessId: string | null;
  missed: number;
}
const subscribers = new Set<Subscriber>();
function authRequest(request: IncomingMessage): Request {
  const cookies: Record<string, string> = {};
  for (const pair of request.headers.cookie?.split(';') ?? []) {
    const at = pair.indexOf('=');
    if (at < 1) continue;
    try { cookies[pair.slice(0, at).trim()] = decodeURIComponent(pair.slice(at + 1).trim()); } catch { /* ignored */ }
  }
  return { cookies } as Request;
}

export function attachRealtime(server: Server) {
  const websocket = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  server.on('upgrade', (req, socket, head) => {
    if (req.url?.split('?')[0] !== '/ws') return socket.destroy();
    const origin = req.headers.origin;
    if (origin && ![config.APP_BASE_URL, config.WEB_ORIGIN].map((url) => new URL(url).origin).includes(origin)) return socket.destroy();
    const request = authRequest(req);
    void getUser(request).then((user) => {
      websocket.handleUpgrade(req, socket, head, (ws) => {
        const client: Subscriber = { socket: ws, request, userId: user.id, businessId: null, missed: 0 };
        subscribers.add(client);
        ws.on('error', () => ws.terminate());
        ws.on('pong', () => { client.missed = 0; });
        ws.on('close', () => subscribers.delete(client));
        ws.on('message', (data) => {
          let message: { type?: string; businessId?: string };
          try { message = JSON.parse(data.toString()); } catch { return; }
          if (message?.type !== 'subscribe' || typeof message.businessId !== 'string') return;
          client.businessId = null;
          void getBusiness(request, message.businessId).then(({ business }) => { client.businessId = business.id; }, () => ws.close(1008));
        });
      });
    }, () => socket.destroy());
  });
  const timer = setInterval(() => {
    for (const client of subscribers) {
      if (client.missed >= 2) client.socket.terminate();
      else {
        client.missed++;
        client.socket.ping();
        if (client.businessId) void getBusiness(client.request, client.businessId).catch(() => client.socket.close(1008));
      }
    }
  }, 25000);
  timer.unref();
  return () => {
    clearInterval(timer);
    for (const client of websocket.clients) client.terminate();
    websocket.close();
  };
}

export function publish(businessId: string, event: RealtimeEvent, opts?: { userIds?: string[] }): void {
  for (const client of subscribers) {
    if (client.businessId !== businessId || client.socket.readyState !== WebSocket.OPEN) continue;
    if (opts?.userIds && !opts.userIds.includes(client.userId)) continue;
    try {
      client.socket.send(JSON.stringify({ businessId, ...event }), (error) => { if (error) client.socket.terminate(); });
    } catch { client.socket.terminate(); }
  }
}

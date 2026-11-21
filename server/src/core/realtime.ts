import type { Server, IncomingMessage } from 'node:http';
import type { Request } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type { RealtimeEvent } from '@nless/shared/core/types';
import { getBusiness, getUser } from './auth';
import { config } from './config';

interface Subscription {
  businessId: string;
  verified: boolean;
  pending: number;
  sends: Promise<void>;
}
const MAX_PENDING_EVENTS = 128;

interface Subscriber {
  socket: WebSocket;
  request: Request;
  userId: string;
  subscription: Subscription | null;
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
        const client: Subscriber = { socket: ws, request, userId: user.id, subscription: null, missed: 0 };
        subscribers.add(client);
        ws.on('error', () => ws.terminate());
        ws.on('pong', () => { client.missed = 0; });
        ws.on('close', () => subscribers.delete(client));
        ws.on('message', (data) => {
          let message: { type?: string; businessId?: string };
          try { message = JSON.parse(data.toString()); } catch { return; }
          if (message?.type !== 'subscribe' || typeof message.businessId !== 'string') return;
          const subscription = { businessId: message.businessId, verified: false, pending: 0, sends: Promise.resolve() };
          client.subscription = subscription;
          void getBusiness(request, subscription.businessId).then(() => { subscription.verified = true; }, () => {
            if (client.subscription === subscription) ws.close(1008);
          });
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
        const subscription = client.subscription;
        if (subscription?.verified) void getBusiness(client.request, subscription.businessId).catch(() => {
          if (client.subscription === subscription) client.socket.close(1008);
        });
      }
    }
  }, 25000);
  timer.unref();
  return (code?: number) => {
    clearInterval(timer);
    for (const client of websocket.clients) {
      if (code) client.close(code);
      else client.terminate();
    }
    if (code) setTimeout(() => {
      for (const client of websocket.clients) client.terminate();
    }, 2000).unref();
    websocket.close();
  };
}

export function publish(businessId: string, event: RealtimeEvent, opts?: { userIds?: string[] }): void {
  const needsChatRead = event.type === 'message.created' || event.type === 'message.updated' || event.type === 'conversation.updated'
    || (event.type === 'custom' && ((event.featureId === 'F09' && event.name === 'inbox.read')
      || (event.featureId === 'F10' && event.name === 'ai.turn')));
  let payload: string | undefined;
  for (const client of subscribers) {
    const subscription = client.subscription;
    if (!subscription?.verified || subscription.businessId !== businessId || client.socket.readyState !== WebSocket.OPEN) continue;
    if (opts?.userIds && !opts.userIds.includes(client.userId)) continue;
    if (subscription.pending >= MAX_PENDING_EVENTS) {
      client.socket.close(1013);
      continue;
    }

    try { payload ??= JSON.stringify({ businessId, ...event }); }
    catch { client.socket.terminate(); continue; }
    const frame = payload;
    const isCurrent = () => client.subscription === subscription && client.socket.readyState === WebSocket.OPEN;
    subscription.pending++;
    // A session or grant can change after subscribing. Serial checks preserve event order.
    subscription.sends = subscription.sends.then(async () => {
      if (!isCurrent()) return;
      const { scope } = await getBusiness(client.request, businessId);
      if (!isCurrent() || (needsChatRead && !scope.permissions.includes('chat.read'))) return;
      client.socket.send(frame, (error) => { if (error) client.socket.terminate(); });
    }).catch(() => {
      if (isCurrent()) client.socket.close(1008);
    }).finally(() => { subscription.pending--; });
  }
}

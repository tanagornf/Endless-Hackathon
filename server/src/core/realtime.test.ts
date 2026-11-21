import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { SEED } from '@nless/shared/core/fixtures';
import type { RealtimeEvent } from '@nless/shared/core/types';
import { afterAll, expect, test, vi } from 'vitest';
import WebSocket from 'ws';
import { closeDb, db } from './db';
import { attachRealtime, publish } from './realtime';
import { createTestAgent, loginAs } from './test-utils';

afterAll(closeDb);

test('an open WebSocket drops revoked chat access and closes when membership is removed', async () => {
  const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
  const staff = SEED.users.find(({ alias }) => alias === 'staff_a')!;
  const accountId = randomUUID();
  const businessId = randomUUID();
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,$2,$3)', [accountId, 'Realtime test', owner.id]);
    await tx.query('INSERT INTO businesses (id,account_id,name) VALUES ($1,$2,$3)', [businessId, accountId, 'Realtime test']);
    await tx.query("INSERT INTO memberships (business_id,user_id,role,permissions) VALUES ($1,$2,'staff',ARRAY['chat.read'])",
      [businessId, staff.id]);
  });

  const agent = await createTestAgent();
  const login = await loginAs(agent, staff.email);
  const cookie = String(login.headers['set-cookie'][0]).split(';', 1)[0];
  const server = createServer();
  const detach = attachRealtime(server);
  const listening = once(server, 'listening');
  server.listen(0, '127.0.0.1');
  await listening;
  const port = (server.address() as AddressInfo).port;
  const socket = new WebSocket('ws://127.0.0.1:' + port + '/ws', { headers: { Cookie: cookie } });
  const received: RealtimeEvent[] = [];
  socket.on('message', (data) => received.push(JSON.parse(data.toString()) as RealtimeEvent));
  const conversationId = randomUUID();
  const message = (text: string): RealtimeEvent => ({
    type: 'message.created', conversationId,
    message: { id: randomUUID(), seq: 1, direction: 'inbound', author: 'customer',
      parts: [{ type: 'text', text }], createdAt: new Date().toISOString() },
  });
  const control = (name: string): RealtimeEvent => ({ type: 'custom', featureId: 'F01', name, data: {} });
  const sawControl = (name: string) => received.some((event) => event.type === 'custom' && event.name === name);
  try {
    await once(socket, 'open');
    socket.send(JSON.stringify({ type: 'subscribe', businessId }));
    await vi.waitFor(() => {
      if (!sawControl('subscribed')) publish(businessId, control('subscribed'));
      expect(sawControl('subscribed')).toBe(true);
    }, { timeout: 5_000, interval: 250 });

    const allowed = message('Permitted synthetic chat');
    publish(businessId, allowed);
    await vi.waitFor(() => expect(received).toContainEqual({ businessId, ...allowed }), { timeout: 3_000 });

    await db.query("UPDATE memberships SET permissions='{}' WHERE business_id=$1 AND user_id=$2", [businessId, staff.id]);
    const denied = message('Synthetic chat after grant removal');
    const update = { type: 'message.updated', conversationId, messageId: randomUUID(), delivery: { mode: 'real', state: 'sent' } } as const;
    const assignment = { type: 'conversation.updated', conversationId, handler: 'human', status: 'open', assigneeUserId: null, version: 2 } as const;
    const inboxRead = { type: 'custom', featureId: 'F09', name: 'inbox.read', data: { conversationId } } as const;
    const aiTurn = { type: 'custom', featureId: 'F10', name: 'ai.turn', data: { turnId: randomUUID(), state: 'completed' } } as const;
    const restricted = [denied, update, assignment, inboxRead, aiTurn];
    for (const event of restricted) publish(businessId, event);
    publish(businessId, control('still-a-member'));
    await vi.waitFor(() => expect(sawControl('still-a-member')).toBe(true), { timeout: 3_000 });
    for (const event of restricted) expect(received).not.toContainEqual({ businessId, ...event });

    await db.query('DELETE FROM memberships WHERE business_id=$1 AND user_id=$2', [businessId, staff.id]);
    const closed = once(socket, 'close');
    publish(businessId, control('removed-member'));
    expect((await closed)[0]).toBe(1008);
    expect(sawControl('removed-member')).toBe(false);
  } finally {
    socket.terminate();
    detach();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}, 20_000);

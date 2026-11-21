import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { db } from '../../core';
import { createTestAgent } from '../../core/test-utils';
import { getHistory, saveMessage } from './service';
import { signVisitorToken, verifyVisitorToken } from './visitor';
import { signalDemoConversation, watchDemoConversation } from './demoSignal';

const demoA = '/api/v1/public/demo-chat/demo-boardgame';
const demoB = '/api/v1/public/demo-chat/demo-repair';
const bizA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const freshToken = () => signVisitorToken(randomUUID());
const requestIds: string[] = [];

function input(text: string) {
  const clientRequestId = randomUUID();
  requestIds.push(clientRequestId);
  return { text, clientRequestId };
}

afterAll(async () => {
  // The integration projects share a queue. Each suite owns only its synthetic turns.
  await db.query(`DELETE FROM jobs j USING messages m
    WHERE j.business_id=m.business_id AND j.type='ai.reply' AND j.dedup_key='ai.reply:'||m.id::text
      AND m.client_request_id=ANY($1::text[])`, [requestIds]);
});

describe('F09 public Demo Chat', { timeout: 30000 }, () => {
  it('retains a notification received between starting a poll and awaiting updates', async () => {
    const conversationId = randomUUID();
    const watcher = watchDemoConversation(randomUUID(), conversationId);
    signalDemoConversation(conversationId);
    try {
      await watcher.wait(10000);
    } finally { watcher.finish(); }
  }, 1000);

  it('rejects tampered and expired visitor tokens', () => {
    const id = randomUUID();
    const token = signVisitorToken(id);
    expect(verifyVisitorToken(token)?.visitorId).toBe(id);
    const last = token.at(-1);
    expect(verifyVisitorToken(token.slice(0, -1) + (last === 'A' ? 'B' : 'A'))).toBeNull();
    expect(verifyVisitorToken(signVisitorToken(id, Math.floor(Date.now() / 1000) - 31 * 86400))).toBeNull();
  });

  it('issues a visitor session, persists one message per retry, and keeps shops separate', async () => {
    const publicAgent = await createTestAgent();
    const shop = await publicAgent.get(demoA);
    expect(shop.body.data.suggestedQuestionsEn).toContain('How much is A-GAME-01?');
    expect((await publicAgent.post(demoA + '/messages').send(input('Hello'))).status).toBe(401);
    const issued = await publicAgent.post(demoA + '/session').send({});
    expect(issued.status).toBe(200);
    expect(verifyVisitorToken(issued.body.data.visitorToken)).not.toBeNull();

    const message = input('How much is A-GAME-01?');
    const first = await publicAgent.post(demoA + '/messages').send(message);
    expect(first.status).toBe(200);
    expect(first.body.data.created).toBe(true);
    expect(first.body.data.message.clientRequestId).toBe(message.clientRequestId);
    const replay = await publicAgent.post(demoA + '/messages').send(message);
    expect(replay.body.data).toMatchObject({ created: false, message: { id: first.body.data.message.id } });
    const reload = await publicAgent.get(demoA + '/poll');
    expect(reload.body.data.items).toHaveLength(1);
    expect(reload.body.data.items[0]).toMatchObject({ author: 'customer', clientRequestId: message.clientRequestId, parts: [{ type: 'text', text: message.text }] });
    expect(reload.body.data).toMatchObject({ pending: { state: 'typing' } });
    expect((await publicAgent.get(demoB + '/poll')).body.data.items).toEqual([]);
    expect((await publicAgent.get(demoA + '/files/' + randomUUID())).status).toBe(404);
  });

  it('enforces text length, moderation and visitor rate limits before persistence', async () => {
    const agent = await createTestAgent();
    const token = freshToken();
    const post = (text: string) => agent.post(demoB + '/messages').set('X-Demo-Visitor', token).send(input(text));
    expect((await post('ก'.repeat(501))).status).toBe(400);
    expect((await post('ทดสอบ [flag]')).body.error.details.reason).toBe('moderation');
    for (let sent = 0; sent < 5; sent++) expect((await post('Hello ' + sent)).status).toBe(200);
    const blocked = await post('Another question');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.details.reason).toBe('visitor');
    const poll = await agent.get(demoB + '/poll').set('X-Demo-Visitor', token);
    expect(poll.body.data.items).toHaveLength(5);
  });

  it('wakes a visitor long poll for a staff message and opens a new chat after reset', async () => {
    const agent = await createTestAgent();
    const token = freshToken();
    const first = await agent.post(demoA + '/messages').set('X-Demo-Visitor', token).send(input('Test long poll'));
    expect(first.status).toBe(200);
    const { conversationId, message } = first.body.data;
    const after = Buffer.from(String(message.seq)).toString('base64url');
    const start = Date.now();
    const polling = agent.get(demoA + '/poll').query({ after, waitMs: 10000 }).set('X-Demo-Visitor', token)
      .then((response) => response);
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    await saveMessage({ businessId: bizA, conversationId, direction: 'outbound', author: 'staff',
      clientRequestId: 'staff-' + randomUUID(), parts: [{ type: 'text', text: 'Staff reply' }] });
    const poll = await polling;
    expect(Date.now() - start).toBeLessThan(9000);
    expect(poll.body.data.items).toMatchObject([{ author: 'staff', parts: [{ type: 'text', text: 'Staff reply' }] }]);
    expect(poll.body.data.items[0]).not.toHaveProperty('clientRequestId');
    const reset = await agent.post(demoA + '/reset').set('X-Demo-Visitor', token).send({});
    expect(reset.status).toBe(200);
    const next = await agent.post(demoA + '/messages').set('X-Demo-Visitor', token).send(input('Start again'));
    expect(next.status).toBe(200);
    expect(next.body.data.conversationId).not.toBe(conversationId);
  });

  it('withholds an AI reply until sent and advances past failed and unknown attempts', async () => {
    const agent = await createTestAgent();
    const token = freshToken();
    const first = await agent.post(demoA + '/messages').set('X-Demo-Visitor', token).send(input('Delivery check'));
    expect(first.status).toBe(200);
    const { conversationId, message } = first.body.data;
    const cursor = Buffer.from(String(message.seq)).toString('base64url');
    const poll = (after: string) => agent.get(demoA + '/poll').query({ after }).set('X-Demo-Visitor', token);
    const attempt = async (text: string) => (await saveMessage({ businessId: bizA, conversationId,
      direction: 'outbound', author: 'ai', parts: [{ type: 'text', text }] })).message;
    const setState = (id: string, state: string) => db.query(
      'UPDATE messages SET delivery_state=$3 WHERE business_id=$1 AND id=$2', [bizA, id, state]);

    const reply = await attempt('Delivered reply');
    expect((await poll(cursor)).body.data).toMatchObject({ items: [] });
    await setState(reply.id, 'pending');
    expect((await poll(cursor)).body.data).toMatchObject({ items: [] });
    const staff = await saveMessage({ businessId: bizA, conversationId, direction: 'outbound', author: 'staff',
      parts: [{ type: 'text', text: 'Staff can still reply' }] });
    const handback = await attempt('Sent after handback');
    await setState(handback.id, 'sent');
    const held = (await poll(cursor)).body.data;
    expect(held.items.map((row: { id: string }) => row.id)).toEqual([staff.message.id, handback.id]);
    const recovered = await poll(held.cursor);
    expect(recovered.body.data.items).not.toContainEqual(expect.objectContaining({ id: reply.id }));
    await setState(reply.id, 'sent');
    const delivered = (await poll(recovered.body.data.cursor)).body.data;
    expect(delivered.items.map((row: { id: string }) => row.id)).toEqual([reply.id]);

    const suppressed = await attempt('Suppressed reply');
    await setState(suppressed.id, 'failed');
    const uncertain = await attempt('Unknown delivery');
    await setState(uncertain.id, 'unknown');
    const later = await attempt('Next delivered reply');
    await setState(later.id, 'sent');
    const resumed = (await poll(delivered.cursor)).body.data;
    expect(resumed.items.map((row: { id: string }) => row.id)).toEqual([later.id]);
    expect((await poll(resumed.cursor)).body.data.items).toEqual([]);
    expect((await getHistory(conversationId, { businessId: bizA })).items.map((row) => row.id))
      .toContain(suppressed.id);
  });

  it('returns later visible messages without long-polling through an entire hidden page', async () => {
    const agent = await createTestAgent();
    const token = freshToken();
    const response = await agent.post(demoA + '/messages').set('X-Demo-Visitor', token).send(input('Long history'));
    expect(response.status).toBe(200);
    const { conversationId, message } = response.body.data;
    for (let batch = 0; batch < 4; batch++) {
      await Promise.all(Array.from({ length: 8 }, () => saveMessage({ businessId: bizA, conversationId,
        direction: 'outbound', author: 'system', parts: [{ type: 'text', text: 'Hidden fixture' }] })));
    }
    const next = await saveMessage({ businessId: bizA, conversationId, direction: 'outbound', author: 'staff',
      parts: [{ type: 'text', text: 'Visible after hidden rows' }] });
    const cursor = Buffer.from(String(message.seq)).toString('base64url');
    const start = Date.now();
    const poll = await agent.get(demoA + '/poll').set('X-Demo-Visitor', token).query({ after: cursor, waitMs: 7000 });
    expect(poll.body.data.items.map((row: { id: string }) => row.id)).toContain(next.message.id);
    expect(Date.now() - start).toBeLessThan(6500);
  }, 45000);

  it('waits on successive polls between two unresolved replies without echoing the sent middle reply', async () => {
    const agent = await createTestAgent();
    const token = freshToken();
    const first = await agent.post(demoA + '/messages').set('X-Demo-Visitor', token).send(input('Retry cadence'));
    const { conversationId, message } = first.body.data;
    const after = Buffer.from(String(message.seq)).toString('base64url');
    const ai = () => saveMessage({ businessId: bizA, conversationId, direction: 'outbound', author: 'ai',
      parts: [{ type: 'text', text: 'Synthetic output' }] });
    await ai();
    const middle = await ai();
    await db.query("UPDATE messages SET delivery_state='sent' WHERE id=$1 AND business_id=$2", [middle.message.id, bizA]);
    await ai();
    const poll = (cursor: string, waitMs: number) => agent.get(demoA + '/poll').set('X-Demo-Visitor', token)
      .query({ after: cursor, waitMs });
    let page = (await poll(after, 0)).body.data;
    expect(page.items.map((row: { id: string }) => row.id)).toEqual([middle.message.id]);
    for (let i = 0; i < 2; i++) {
      const started = Date.now();
      page = (await poll(page.cursor, 1100)).body.data;
      expect(page.items).toEqual([]);
      expect(Date.now() - started).toBeGreaterThanOrEqual(950);
    }
  });

  it('reloads the recent visible history and revisits older delivery among 31 unresolved replies', async () => {
    const agent = await createTestAgent();
    const token = freshToken();
    const first = await agent.post(demoA + '/messages').set('X-Demo-Visitor', token).send(input('Cold history'));
    const { conversationId, message } = first.body.data;
    const staff = await saveMessage({ businessId: bizA, conversationId, direction: 'outbound', author: 'staff',
      parts: [{ type: 'text', text: 'Retained staff reply' }] });
    const ai = () => saveMessage({ businessId: bizA, conversationId, direction: 'outbound', author: 'ai',
      parts: [{ type: 'text', text: 'Unresolved fixture' }] });
    const older = await ai();
    for (let i = 0; i < 5; i++) await Promise.all(Array.from({ length: 6 }, ai));
    const poll = (after?: string) => agent.get(demoA + '/poll').set('X-Demo-Visitor', token).query({ after, waitMs: 0 });
    const initial = (await poll()).body.data;
    expect(initial.items.map((row: { id: string }) => row.id)).toEqual([message.id, staff.message.id]);
    await db.query("UPDATE messages SET delivery_state='sent' WHERE id=$1 AND business_id=$2", [older.message.id, bizA]);
    expect((await poll(initial.cursor)).body.data.items.map((row: { id: string }) => row.id)).toContain(older.message.id);
  }, 45000);

  it('rejects an extra visitor before creating a message when the shop cap is reached', async () => {
    const agent = await createTestAgent();
    const prior = process.env.DEMO_CHAT_DAILY_TURN_CAP;
    const { current } = await db.one<{ current: number }>(`SELECT COALESCE((SELECT turns FROM demo_chat_daily_turns WHERE business_id=$1
      AND day=(now() AT TIME ZONE 'Asia/Bangkok')::date),0) AS current`, [bizA]);
    process.env.DEMO_CHAT_DAILY_TURN_CAP = String(current + 1);
    try {
      const first = await agent.post(demoA + '/messages').set('X-Demo-Visitor', freshToken()).send(input('Welcome'));
      expect(first.status).toBe(200);
      const rejectedToken = freshToken();
      const blocked = await agent.post(demoA + '/messages').set('X-Demo-Visitor', rejectedToken).send(input('Price?'));
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.details.reason).toBe('daily_cap');
      const empty = await agent.get(demoA + '/poll').set('X-Demo-Visitor', rejectedToken);
      expect(empty.body.data).toMatchObject({ conversationId: null, items: [] });
      expect((await getHistory(first.body.data.conversationId, { businessId: bizA })).items).toHaveLength(1);
    } finally {
      if (prior === undefined) delete process.env.DEMO_CHAT_DAILY_TURN_CAP;
      else process.env.DEMO_CHAT_DAILY_TURN_CAP = prior;
    }
  });
});

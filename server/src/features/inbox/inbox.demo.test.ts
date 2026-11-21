import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { db } from '../../core';
import { createTestAgent } from '../../core/test-utils';
import { getHistory, saveMessage } from './service';
import { signVisitorToken, verifyVisitorToken } from './visitor';

const demoA = '/api/v1/public/demo-chat/demo-boardgame';
const demoB = '/api/v1/public/demo-chat/demo-repair';
const bizA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const freshToken = () => signVisitorToken(randomUUID());
const input = (text: string) => ({ text, clientRequestId: randomUUID() });

describe('F09 public Demo Chat', { timeout: 30000 }, () => {
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
    const replay = await publicAgent.post(demoA + '/messages').send(message);
    expect(replay.body.data).toMatchObject({ created: false, message: { id: first.body.data.message.id } });
    const reload = await publicAgent.get(demoA + '/poll');
    expect(reload.body.data.items).toHaveLength(1);
    expect(reload.body.data.items[0]).toMatchObject({ author: 'customer', parts: [{ type: 'text', text: message.text }] });
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
      parts: [{ type: 'text', text: 'Staff reply' }] });
    const poll = await polling;
    expect(Date.now() - start).toBeLessThan(9000);
    expect(poll.body.data.items).toMatchObject([{ author: 'staff', parts: [{ type: 'text', text: 'Staff reply' }] }]);
    const reset = await agent.post(demoA + '/reset').set('X-Demo-Visitor', token).send({});
    expect(reset.status).toBe(200);
    const next = await agent.post(demoA + '/messages').set('X-Demo-Visitor', token).send(input('Start again'));
    expect(next.status).toBe(200);
    expect(next.body.data.conversationId).not.toBe(conversationId);
  });

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

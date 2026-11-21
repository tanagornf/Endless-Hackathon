import { createHmac, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import { expect, test } from 'vitest';
import { db, drainJobs } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { completeDeliveryBatch, findDeliveryBatch, reservePushBatch, reserveReplyBatch } from './repo';

test('LINE routes isolate connection credentials and accept one signed event across concurrent redelivery', async () => {
  const a = SEED.businesses.find((shop) => shop.alias === 'biz_demo_a')!.id;
  const b = SEED.businesses.find((shop) => shop.alias === 'biz_demo_b')!.id;
  const owner = await createTestAgent();
  const staff = await createTestAgent();
  const other = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  await loginAs(staff, 'staff.a@example.test');
  await loginAs(other, 'owner.b@example.test');
  const path = '/api/v1/businesses/' + a + '/channels/line';

  const channelId = String(randomInt(100_000_000, 999_999_999));
  const channelSecret = randomBytes(16).toString('hex');
  const accessToken = randomBytes(32).toString('hex');
  const credentials = { channelId, channelSecret, accessToken };
  const connect = await owner.post(path + '/connect').set('X-Requested-With', 'nless').send(credentials);
  expect(connect.status).toBe(200);

  try {
    expect(connect.body.data).toMatchObject({ connected: true, mode: 'sandbox', hasAccessToken: true });
    expect(connect.body.data.webhookUrl).toMatch(new RegExp('/webhooks/line/' + channelId + '$'));
    expect(JSON.stringify(connect.body)).not.toContain(channelSecret);
    expect(JSON.stringify(connect.body)).not.toContain(accessToken);
    const connection = await db.one<{ id: string; bot_user_id: string; channel_secret_enc: string; access_token_enc: string }>(
      'SELECT id, bot_user_id, channel_secret_enc, access_token_enc FROM line_connections WHERE business_id = $1 AND channel_id = $2', [a, channelId],
    );
    expect(connection.channel_secret_enc).toMatch(/^enc:v1:/);
    expect(connection.access_token_enc).toMatch(/^enc:v1:/);
    expect(await other.get(path).then((res) => res.status)).toBe(404);
    expect(await staff.post(path + '/connect').set('X-Requested-With', 'nless').send(credentials).then((res) => res.status)).toBe(403);
    expect(await staff.post(path + '/verify').set('X-Requested-With', 'nless').then((res) => res.status)).toBe(403);
    expect(await staff.delete(path).set('X-Requested-With', 'nless').then((res) => res.status)).toBe(403);
    expect(await other.post('/api/v1/businesses/' + b + '/channels/line/connect').set('X-Requested-With', 'nless').send(credentials).then((res) => res.body.error?.details?.reason)).toBe('channel_in_use');
    expect(await owner.post(path + '/verify').set('X-Requested-With', 'nless').then((res) => res.status)).toBe(200);

    const eventId = randomUUID();
    const messageId = String(randomInt(100_000_000, 999_999_999));
    const lineUser = 'U' + randomBytes(16).toString('hex');
    const webhook = '/webhooks/line/' + channelId;
    const body = JSON.stringify({
      destination: connection.bot_user_id,
      events: [{
        type: 'message', mode: 'active', webhookEventId: eventId, timestamp: Date.now(),
        source: { type: 'user', userId: lineUser },
        message: { type: 'text', id: messageId, text: 'How much is A-GAME-01?' },
        replyToken: randomBytes(24).toString('hex'),
      }],
    });
    const signature = createHmac('sha256', channelSecret).update(body).digest('base64');
    expect(await owner.post(webhook).type('application/json').send(body).then((res) => res.status)).toBe(401);
    expect(await owner.post(webhook).type('application/json').set('x-line-signature', signature + ', ' + signature).send(body).then((res) => res.status)).toBe(401);
    expect(await db.maybeOne('SELECT 1 FROM line_events WHERE business_id = $1 AND webhook_event_id = $2', [a, eventId])).toBeNull();
    const send = () => owner.post(webhook).type('application/json').set('x-line-signature', signature).send(body);
    const replies = await Promise.all([send(), send()]);
    expect(replies.map((reply) => reply.status)).toEqual([200, 200]);
    expect(await db.one('SELECT count(*)::int AS count FROM jobs WHERE business_id = $1 AND dedup_key = $2', [a, 'line.event:' + eventId])).toEqual({ count: 1 });
    expect((await drainJobs({ type: 'line.event' })).dead).toBe(0);
    expect((await drainJobs({ type: 'ai.reply' })).dead).toBe(0);
    expect((await drainJobs({ type: 'core.deliver' })).dead).toBe(0);
    const stored = await db.one<{ id: string; conversation_id: string; text: string }>(
      'SELECT id, conversation_id, text FROM messages WHERE business_id = $1 AND external_id = $2', [a, messageId],
    );
    expect(stored.text).toBe('How much is A-GAME-01?');
    expect(await db.one("SELECT count(*)::int AS count FROM messages WHERE business_id = $1 AND conversation_id = $2 AND author = 'ai' AND delivery_state = 'sent' AND delivery_mode = 'sandbox'", [a, stored.conversation_id])).toEqual({ count: 1 });
    expect(await db.one('SELECT count(*)::int AS count FROM jobs WHERE business_id = $1 AND dedup_key = $2', [a, 'ai.reply:' + stored.id])).toEqual({ count: 1 });
    const events = await owner.get(path + '/events');
    expect(events.body.data.items).toContainEqual(expect.objectContaining({ webhookEventId: eventId, eventType: 'message', state: 'done' }));
    expect((await send()).status).toBe(200);

    const outbound = await saveMessage({
      businessId: a, conversationId: stored.conversation_id, author: 'staff', direction: 'outbound',
      parts: [{ type: 'text', text: 'This is a sandbox test.' }],
    });
    const key = { businessId: a, messageId: outbound.message.id, index: 0, retryKey: randomUUID() };
    const replyHash = randomBytes(32).toString('hex');
    expect(await reserveReplyBatch(key, replyHash)).toBe(true);
    expect(await reserveReplyBatch(key, replyHash)).toBe(false);
    expect(await findDeliveryBatch(key)).toMatchObject({ state: 'unknown' });
    await completeDeliveryBatch(key, 'reply', { state: 'accepted', sent_ids: ['fixture-reply'], request_id: 'fixture-request' });
    expect(await findDeliveryBatch(key)).toMatchObject({ state: 'accepted', sent_ids: ['fixture-reply'] });

    const pushed = { ...key, index: 1, retryKey: randomUUID() };
    const reserved = await reservePushBatch(pushed);
    expect(reserved).toMatchObject({ retry_key: pushed.retryKey });
    expect(await reservePushBatch({ ...pushed, retryKey: randomUUID() })).toEqual(reserved);
    expect(await findDeliveryBatch(pushed)).toMatchObject({ state: 'pending' });
    const stats = await db.one<{ calls: number }>('SELECT COALESCE(sum(push_calls), 0)::int AS calls FROM line_push_usage WHERE business_id = $1', [a]);
    const pushResult = { state: 'accepted' as const, sent_ids: ['fixture-push'], request_id: null };
    await completeDeliveryBatch(pushed, 'push', pushResult, 1);
    await completeDeliveryBatch(pushed, 'push', pushResult, 1);
    expect(await db.one('SELECT COALESCE(sum(push_calls), 0)::int AS calls FROM line_push_usage WHERE business_id = $1', [a])).toEqual({ calls: stats.calls + 1 });

    expect(await owner.delete(path).set('X-Requested-With', 'nless').then((res) => res.status)).toBe(204);
    expect(await db.one('SELECT status, access_token_enc, channel_secret_enc FROM line_connections WHERE id = $1 AND business_id = $2', [connection.id, a])).toEqual({ status: 'inactive', access_token_enc: null, channel_secret_enc: null });
    expect(await owner.post(webhook).type('application/json').send(body).then((res) => res.status)).toBe(200);
  } finally {
    await db.query("DELETE FROM line_connections WHERE business_id = $1 AND channel_id = $2 AND source = 'ui'", [a, channelId]);
  }
}, 20_000);

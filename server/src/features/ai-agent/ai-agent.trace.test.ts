import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { ApiResult, RealtimeEvent } from '@nless/shared/core/types';
import type { AiTurnTrace } from '@nless/shared/features/ai-agent/types';
import type { MessageRecord } from '@nless/shared/features/inbox/types';
import * as auth from '../../core/auth';
import { closeDb } from '../../core/db';
import * as realtime from '../../core/realtime';
import { seedId } from '../../core/seed';
import { createTestAgent, drainJobs, loginAs, simulateInbound } from '../../core/test-utils';

const shopA = seedId('biz_demo_a');
const shopB = seedId('biz_demo_b');
let owner: Awaited<ReturnType<typeof createTestAgent>>;
let turnId: string;
let inboundMessageId: string;
let replyMessageId: string;
let conversationId: string;
let shopEvents: RealtimeEvent[];

const tracePath = (shop: string, turn = turnId) => '/api/v1/businesses/' + shop + '/ai/turns/' + turn;

beforeAll(async () => {
  owner = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  const published = vi.spyOn(realtime, 'publish');
  try {
    const competing = await simulateInbound(owner, shopA, 'How much is A-CARD-01?', 'f10-trace-competitor-' + randomUUID());
    expect((await drainJobs({ type: 'ai.reply' })).dead).toBe(0);

    const input = await simulateInbound(owner, shopA, 'How much is A-GAME-01?', 'f10-trace-' + randomUUID());
    inboundMessageId = input.message.id;
    conversationId = input.conversation.id;
    expect((await drainJobs({ type: 'ai.reply' })).dead).toBe(0);
    shopEvents = published.mock.calls.filter(([businessId]) => businessId === shopA).map(([, event]) => event);
    const reply = shopEvents.find((event) => event.type === 'message.created' &&
      event.conversationId === conversationId && event.message.author === 'ai');
    if (reply?.type !== 'message.created') throw new Error('The job did not publish the fixture reply');
    replyMessageId = reply.message.id;

    const completed = shopEvents.flatMap((event) => event.type === 'custom' && event.name === 'ai.turn' &&
      event.data.state === 'completed' && typeof event.data.turnId === 'string' ? [{ event, id: event.data.turnId }] : []);
    const observed = await Promise.all(completed.map(async ({ event, id }) => {
      const response = await owner.get(tracePath(shopA, id));
      expect(response.status).toBe(200);
      return { event, trace: (response.body as ApiResult<AiTurnTrace>).data };
    }));
    const rival = observed.find(({ trace }) => trace.inboundMessageId === competing.message.id &&
      trace.conversationId === competing.conversation.id && trace.replyMessageId);
    const final = observed.find(({ trace }) => trace.inboundMessageId === inboundMessageId &&
      trace.conversationId === conversationId && trace.replyMessageId === replyMessageId);
    if (!rival || !final) throw new Error('The owner could not correlate both published turns');
    turnId = final.trace.turnId;
    expect(shopEvents.indexOf(rival.event)).toBeLessThan(shopEvents.indexOf(final.event));
    expect(shopEvents.indexOf(final.event)).toBeGreaterThan(shopEvents.indexOf(reply));

    await drainJobs({ type: 'core.deliver' });
    for (const trace of [rival.trace, final.trace]) {
      const messages = await owner.get('/api/dev/conversations/' + trace.conversationId + '/messages');
      expect(messages.status).toBe(200);
      const { items } = (messages.body as ApiResult<{ items: MessageRecord[] }>).data;
      expect(items.find(({ id }) => id === trace.replyMessageId)).toMatchObject({ author: 'ai', delivery: { state: 'sent' } });
    }
  } finally {
    published.mockRestore();
  }
}, 40_000);

afterAll(closeDb);

it('reads the published turn through the shop owner session and links both visible messages', async () => {
  const response = await owner.get(tracePath(shopA));
  expect(response.status).toBe(200);
  const { data } = response.body as ApiResult<AiTurnTrace>;
  expect(data).toMatchObject({
    turnId, conversationId, inboundMessageId, replyMessageId, state: 'completed', replyLanguage: 'en',
    evidenceIds: ['catalog:' + seedId('item_a_game') + ':v1'],
    productRefs: [expect.objectContaining({ sku: 'A-GAME-01' })],
  });
  expect(data).not.toHaveProperty('replyParts');
  expect(data).not.toHaveProperty('reply_parts');
  expect(data).not.toHaveProperty('parts');
});

it('denies a signed-in staff scope without chat.read', async () => {
  const staff = await createTestAgent();
  await loginAs(staff, 'staff.a@example.test');
  const getBusiness = auth.getBusiness;
  const withoutChatRead = vi.spyOn(auth, 'getBusiness').mockImplementationOnce(async (req, businessId) => {
    const scope = await getBusiness(req, businessId);
    return { ...scope, scope: { ...scope.scope, permissions: scope.scope.permissions.filter((permission) => permission !== 'chat.read') } };
  });
  try {
    const denied = await staff.get(tracePath(shopA));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('PERMISSION_DENIED');
  } finally {
    withoutChatRead.mockRestore();
  }
});

it('returns the same missing trace response to another tenant', async () => {
  const otherOwner = await createTestAgent();
  await loginAs(otherOwner, 'owner.b@example.test');
  const other = await otherOwner.get(tracePath(shopB));
  expect(other.status).toBe(404);
  expect(other.body.error.code).toBe('NOT_FOUND');
  expect((await otherOwner.get(tracePath(shopA))).status).toBe(404);
  expect((await owner.get(tracePath(shopA, randomUUID()))).status).toBe(404);
});

it('requires a session and rejects malformed turn IDs', async () => {
  const visitor = await createTestAgent();
  expect((await visitor.get(tracePath(shopA))).status).toBe(401);
  const invalid = await owner.get(tracePath(shopA, 'not-a-turn'));
  expect(invalid.status).toBe(400);
  expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
});

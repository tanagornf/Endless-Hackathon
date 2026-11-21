import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { ApiResult, RealtimeEvent } from '@nless/shared/core/types';
import type { AiTurnTrace } from '@nless/shared/features/ai-agent/types';
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
    const input = await simulateInbound(owner, shopA, 'How much is A-GAME-01?', 'f10-trace-' + randomUUID());
    inboundMessageId = input.message.id;
    conversationId = input.conversation.id;
    expect((await drainJobs()).dead).toBe(0);
    shopEvents = published.mock.calls.filter(([businessId]) => businessId === shopA).map(([, event]) => event);
    const final = shopEvents.find((event) => event.type === 'custom' && event.name === 'ai.turn' && event.data.state === 'completed');
    const reply = shopEvents.find((event) => event.type === 'message.created' &&
      event.conversationId === conversationId && event.message.author === 'ai');
    if (final?.type !== 'custom' || reply?.type !== 'message.created') throw new Error('The job did not publish both reply and trace events');
    turnId = String(final.data.turnId);
    replyMessageId = reply.message.id;
    expect(shopEvents.indexOf(final)).toBeGreaterThan(shopEvents.indexOf(reply));
  } finally {
    published.mockRestore();
  }
}, 20_000);

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

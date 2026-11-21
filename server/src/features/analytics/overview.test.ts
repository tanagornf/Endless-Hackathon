import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { requestHumanHandoff } from '../team/service';
import { getDashboard } from './service';
import { resolveRange } from './range';

const shop = seedId('biz_demo_a');
const other = seedId('biz_demo_b');
const noText = [{ type: 'text', text: 'Synthetic shop overview' }] as const;
afterAll(closeDb);

async function buyer(businessId: string, occurredAt: string, options: {
  externalId?: string; channel?: 'line' | 'web'; origin?: 'live' | 'demo';
} = {}) {
  return saveMessage({
    businessId, customer: { channel: options.channel ?? 'line', externalId: options.externalId ?? randomUUID() },
    direction: 'inbound', author: 'customer', origin: options.origin ?? 'live', occurredAt, triggerAi: false,
    parts: [...noText],
  });
}

async function reply(conversationId: string, author: 'ai' | 'staff', occurredAt: string, origin: 'live' | 'system' = 'live') {
  return saveMessage({ businessId: shop, conversationId, direction: 'outbound', author, occurredAt, origin,
    triggerAi: false, parts: [...noText] });
}

it('uses shop calendar boundaries with a half-open UTC query window', async () => {
  const day = { from: '2026-11-21', to: '2026-11-21' };
  expect(await resolveRange('Asia/Bangkok', day)).toMatchObject({
    fromUtc: '2026-11-20T17:00:00.000Z', toUtc: '2026-11-21T17:00:00.000Z',
  });
  expect(await resolveRange('Asia/Tokyo', day)).toMatchObject({
    fromUtc: '2026-11-20T15:00:00.000Z', toUtc: '2026-11-21T15:00:00.000Z',
  });
  await expect(resolveRange('Asia/Bangkok', { from: '2026-11-22', to: '2026-11-21' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(resolveRange('Asia/Bangkok', { from: '2026-08-01', to: '2026-11-21' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
});

it('computes LINE impact and first replies without web, synthetic modes or another shop', { timeout: 25_000 }, async () => {
  const externalId = randomUUID();
  const ai = await buyer(shop, '2024-10-20T17:00:00.000Z', { externalId });
  await buyer(shop, '2024-10-20T17:03:00.000Z', { externalId });
  await reply(ai.conversation.id, 'ai', '2024-10-20T17:00:10.000Z');
  const staff = await buyer(shop, '2024-10-20T17:01:00.000Z');
  await reply(staff.conversation.id, 'ai', '2024-10-20T17:01:01.000Z', 'system');
  await reply(staff.conversation.id, 'staff', '2024-10-20T17:02:00.000Z');
  const unanswered = await buyer(shop, '2024-10-21T16:59:59.999Z');
  await reply(unanswered.conversation.id, 'ai', '2024-10-22T17:00:00.000Z');
  await buyer(shop, '2024-10-21T17:00:00.000Z');
  await buyer(shop, '2024-10-20T16:59:59.999Z');
  await buyer(shop, '2024-10-20T18:00:00.000Z', { channel: 'web' });
  await buyer(shop, '2024-10-20T18:00:00.000Z', { origin: 'demo' });
  await buyer(shop, '2024-10-20T18:00:00.000Z', { externalId: 'eval-' + randomUUID() });
  await buyer(shop, '2024-10-20T18:00:00.000Z', { externalId: 'live-sim:' + randomUUID() });
  await buyer(other, '2024-10-20T18:00:00.000Z');

  const report = await getDashboard(shop, 'Asia/Bangkok', { from: '2024-10-21', to: '2024-10-22' });
  expect(report.conversations).toMatchObject({ active: 4, customersActive: 4 });
  expect(report.daily).toEqual([
    { date: '2024-10-21', conversations: 3, customerMessages: 4, aiReplies: 1, staffMessages: 1 },
    { date: '2024-10-22', conversations: 1, customerMessages: 1, aiReplies: 0, staffMessages: 0 },
  ]);
  expect(report.hourly).toHaveLength(24);
  expect(report.hourly[0].customerMessages).toBe(4);
  expect(report.hourly[23].customerMessages).toBe(1);
  expect(report.impact).toMatchObject({
    activeConversations: 4, autoResolved: { count: 1, pct: 25 }, staffTouched: 1,
    firstResponse: { ai: { n: 1, medianSeconds: 10 }, staff: { n: 1, medianSeconds: 60 }, all: { n: 2, medianSeconds: 35 }, unanswered: 2 },
    orders: { available: false }, followUps: { available: false },
    aiCost: { basis: 'none', knownUsdMicros: null, perAutoResolvedUsdMicros: null },
    staffMinutesSaved: { minutes: 3, isEstimate: true },
  });
  const empty = await getDashboard(shop, 'Asia/Bangkok', { from: '2024-09-01', to: '2024-09-02' });
  expect(empty.daily.map(row => row.customerMessages)).toEqual([0, 0]);
  expect(empty.impact).toMatchObject({
    activeConversations: 0, autoResolved: { count: 0, pct: null },
    firstResponse: { all: { n: 0, medianSeconds: null }, unanswered: 0 },
  });
});

it('counts recorded staff handoffs within eligible LINE chats and a current waiting queue', async () => {
  const baseline = await getDashboard(shop, 'Asia/Bangkok', {});
  const incoming = await buyer(shop, new Date().toISOString());
  await requestHumanHandoff(incoming.conversation.id, { reason: 'synthetic support', actor: 'customer' }, { businessId: shop });
  const latest = await getDashboard(shop, 'Asia/Bangkok', {});
  expect(latest.impact.handoff.count).toBe(baseline.impact.handoff.count + 1);
  expect(latest.now.waitingForStaff).toBe(baseline.now.waitingForStaff + 1);
});

it('enforces shop and staff permissions and versioned estimate settings', { timeout: 25_000 }, async () => {
  const agent = await createTestAgent();
  const url = (id: string) => '/api/v1/businesses/' + id + '/analytics';
  expect((await agent.get(url(shop) + '/dashboard')).status).toBe(401);
  await loginAs(agent, 'owner.a@example.test');
  expect((await agent.get(url(other) + '/dashboard')).status).toBe(404);
  expect((await agent.get(url(shop) + '/dashboard?from=2026-02-30')).status).toBe(400);
  expect((await agent.get(url(shop) + '/impact?from=2024-09-01&to=2024-09-01')).status).toBe(200);
  const before = (await agent.get(url(shop) + '/settings')).body.data;
  const submit = () => agent.put(url(shop) + '/settings').set('X-Requested-With', 'nless')
    .send({ expectedVersion: before.version, minutesPerConversation: 7 });
  const updated = await submit();
  expect(updated.status).toBe(200);
  expect(updated.body.data).toMatchObject({ minutesPerConversation: 7, version: before.version + 1 });
  expect((await submit()).status).toBe(409);
  await loginAs(agent, 'staff.a@example.test');
  expect((await agent.get(url(shop) + '/dashboard')).status).toBe(403);
  expect((await submit()).status).toBe(403);
});

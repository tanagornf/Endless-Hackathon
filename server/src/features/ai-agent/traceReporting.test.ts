import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import type { ApiResult, Page } from '@nless/shared/core/types';
import type { AiTurnMetrics, AiTurnStateName, AiTurnSummary } from '@nless/shared/features/ai-agent/types';
import * as auth from '../../core/auth';
import { closeDb, db } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { listAiTurnTopics } from './service';

const shopA = seedId('biz_demo_a');
const shopB = seedId('biz_demo_b');
const path = (shop: string, endpoint = 'turns') => '/api/v1/businesses/' + shop + '/ai/' + endpoint;
const range = { from: '2000-01-01T00:00:00Z', to: '2000-01-02T00:00:00Z' };
const at = (microseconds: number) => '2000-01-01T00:00:00.' + String(microseconds).padStart(6, '0') + 'Z';
const savedReply = randomUUID();

let owner: Awaited<ReturnType<typeof createTestAgent>>;
let shopBCustomer: Awaited<ReturnType<typeof createTestAgent>>;
let conversationId: string;
let customerId: string;
const turnIds = new Map<string, string>();

beforeAll(async () => {
  owner = await createTestAgent();
  shopBCustomer = await createTestAgent();
  await loginAs(owner, 'owner.a@example.test');
  await loginAs(shopBCustomer, 'owner.b@example.test');
  const rows: {
    key: string; at: string; latency: number; state: AiTurnStateName; mode?: 'suggest'; businessId?: string; saved?: boolean;
  }[] = [
    { key: 'complete', at: at(500), latency: 1000, state: 'completed', saved: true },
    { key: 'awaiting', at: at(600), latency: 2000, state: 'awaiting_confirmation', saved: true },
    { key: 'handoff', at: at(600), latency: 9000, state: 'handoff' },
    { key: 'superseded', at: at(300), latency: 20000, state: 'superseded' },
    { key: 'failed', at: at(100), latency: 3, state: 'failed' },
    { key: 'unsaved', at: at(200), latency: 1000, state: 'running' },
    { key: 'boundary', at: range.to, latency: 1, state: 'completed', saved: true },
    { key: 'suggest', at: at(700), latency: 50, state: 'completed', mode: 'suggest', saved: true },
    { key: 'other', at: at(800), latency: 20, state: 'completed', businessId: shopB, saved: true },
  ];
  const externalId = 'f10-reporting-' + randomUUID();
  for (const row of rows) {
    const businessId = row.businessId ?? shopA;
    const input = await saveMessage({
      businessId, customer: { channel: 'web', externalId }, direction: 'inbound', author: 'customer',
      parts: [{ type: 'text', text: 'Synthetic reporting question' }], triggerAi: false,
    });
    if (businessId === shopA) {
      conversationId = input.conversation.id;
      customerId = input.conversation.customerId;
    }
    const { id } = await db.one<{ id: string }>(
      `INSERT INTO ai_turns (business_id, conversation_id, inbound_message_id, inbound_created_at, started_at, finished_at,
        state, mode, latency_ms, intent, reply_language, evidence_ids, reply_parts, reply_message_id)
       VALUES ($1, $2, $3, $4, $4, $4, $5, $6, $7, 'QUESTION', 'en', ARRAY['catalog:sample'],
         '[{"type":"text","text":"Private fixture reply"}]', $8) RETURNING id`,
      [businessId, input.conversation.id, input.message.id, row.at, row.state, row.mode ?? 'reply', row.latency, row.saved ? savedReply : null]);
    turnIds.set(row.key, id);
  }
});

afterAll(async () => {
  try {
    await db.query('DELETE FROM ai_turns WHERE id = ANY($1::uuid[])', [[...turnIds.values()]]);
  } finally {
    await closeDb();
  }
});

it('paginates a tenant conversation through duplicate and fractional timestamps', async () => {
  const filters = { conversationId, intent: 'QUESTION', limit: 2 };
  const items: AiTurnSummary[] = [];
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 4; pageNumber += 1) {
    const response = await owner.get(path(shopA)).query({ ...filters, cursor });
    expect(response.status).toBe(200);
    const page = (response.body as ApiResult<Page<AiTurnSummary>>).data;
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  }
  expect(cursor).toBeUndefined();
  expect(items.map((item) => item.turnId)).toEqual([
    turnIds.get('boundary'), turnIds.get('suggest'),
    ...[turnIds.get('awaiting')!, turnIds.get('handoff')!].sort().reverse(),
    ...['complete', 'superseded', 'unsaved', 'failed'].map((key) => turnIds.get(key)),
  ]);
  expect(items[0]).toMatchObject({ intent: 'QUESTION', state: 'completed', conversationId, evidenceCount: 1, replyLanguage: 'en' });
  expect(items[0]).not.toHaveProperty('replyParts');
  expect(items[0]).not.toHaveProperty('inboundMessageId');
  expect(items[0]).not.toHaveProperty('evidenceIds');
  const other = await shopBCustomer.get(path(shopB)).query(filters);
  expect(other.status).toBe(200);
  expect(other.body.data.items).toEqual([]);
  const skipped = await owner.get(path(shopA)).query({ ...filters, state: 'superseded' });
  expect(skipped.body.data.items.map((item: AiTurnSummary) => item.turnId)).toEqual([turnIds.get('superseded')]);
});

it('counts only reply mode in a half-open window and computes the grounded median', async () => {
  const response = await owner.get(path(shopA, 'metrics')).query(range);
  expect(response.status).toBe(200);
  expect((response.body as ApiResult<AiTurnMetrics>).data).toEqual({
    turns: 6, completed: 1, awaitingConfirmation: 1, handoff: 1, failed: 1, skipped: 1, medianLatencyMs: 2000,
  });
  const empty = await owner.get(path(shopA, 'metrics')).query({ from: at(1), to: at(2) });
  expect(empty.status).toBe(200);
  expect(empty.body.data).toMatchObject({ turns: 0, medianLatencyMs: null });
  const other = await shopBCustomer.get(path(shopB, 'metrics')).query(range);
  expect(other.body.data).toMatchObject({ turns: 1, completed: 1, medianLatencyMs: 20 });
});

it('rejects malformed queries and requires both a business session and chat.read', async () => {
  const visitor = await createTestAgent();
  expect((await visitor.get(path(shopA))).status).toBe(401);
  await expect(owner.get(path(shopA)).query({ cursor: 'invalid' })).resolves.toMatchObject({ status: 400 });
  await expect(owner.get(path(shopA)).query({ limit: 101 })).resolves.toMatchObject({ status: 400 });
  await expect(owner.get(path(shopA, 'metrics')).query({ from: range.to, to: range.from })).resolves.toMatchObject({ status: 400 });
  const readBusiness = auth.getBusiness;
  const denied = vi.spyOn(auth, 'getBusiness').mockImplementation(async (request, businessId) => {
    const verified = await readBusiness(request, businessId);
    return { ...verified, scope: { ...verified.scope, permissions: verified.scope.permissions.filter((key) => key !== 'chat.read') } };
  });
  try {
    expect((await owner.get(path(shopA))).status).toBe(403);
    expect((await owner.get(path(shopA, 'metrics'))).status).toBe(403);
  } finally {
    denied.mockRestore();
  }
});

it('exports oldest-first persisted reply topics without crossing the business or limit', async () => {
  const options = { finishedFrom: range.from, finishedTo: range.to };
  const topics = await listAiTurnTopics(shopA, options);
  expect(topics.map((topic) => topic.turnId)).toEqual([turnIds.get('complete'), turnIds.get('awaiting')]);
  expect(topics[0]).toMatchObject({ conversationId, customerId, replyMessageId: savedReply, businessId: shopA });
  expect(await listAiTurnTopics(shopA, { ...options, limit: 1 })).toEqual(topics.slice(0, 1));
  expect((await listAiTurnTopics(shopB, options)).map((topic) => topic.turnId)).toEqual([turnIds.get('other')]);
});

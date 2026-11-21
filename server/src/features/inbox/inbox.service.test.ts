import { randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import type { SaveMessageInput } from '@nless/shared/features/inbox/types';
import { createSession, db, jobs } from '../../core';
import { createTestAgent, drainJobs, loginAs } from '../../core/test-utils';
import { assignConversation } from '../team/service';
import { partsToText } from './mappers';
import { getConversation, getCustomerLanguage, getCustomerLastInboundAt, getHistory, saveMessage } from './service';

const shopA = SEED.businesses[0]!;
const shopB = SEED.businesses[1]!;

function inbound(overrides: Partial<SaveMessageInput> = {}): SaveMessageInput {
  return {
    businessId: shopA.id,
    customer: { channel: 'web', externalId: 't-' + randomUUID(), displayName: 'Test Visitor' },
    direction: 'inbound',
    author: 'customer',
    parts: [{ type: 'text', text: 'How much is A-GAME-01?' }],
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('F09 inbox persistence', { timeout: 30000 }, () => {
  it('persists inbound once across concurrent provider retries and enqueues one job', async () => {
    const input = inbound({ externalId: randomUUID() });
    const results = await Promise.all([saveMessage(input), saveMessage(input)]);
    const first = results.find((result) => result.created)!;
    const replay = results.find((result) => !result.created)!;
    expect(first.message.seq).toBe(1);
    expect(first.conversation.unreadCount).toBe(1);
    expect(replay.message.id).toBe(first.message.id);
    expect(replay.aiJobId).toBeNull();
    expect(await db.one('SELECT type,dedup_key,lock_key FROM jobs WHERE id=$1', [first.aiJobId])).toMatchObject({
      type: 'ai.reply', dedup_key: 'ai.reply:' + first.message.id, lock_key: 'conversation:' + first.conversation.id,
    });
    expect((await getHistory(first.conversation.id)).items).toHaveLength(1);
  });

  it('keeps provider ids scoped to business and channel', async () => {
    const externalId = randomUUID();
    const web = await saveMessage(inbound({ externalId, triggerAi: false }));
    const otherChannel = await saveMessage(inbound({ externalId, triggerAi: false, customer: {
      channel: 'line', externalId: 't-' + randomUUID(),
    } }));
    const otherShop = await saveMessage(inbound({ externalId, triggerAi: false, businessId: shopB.id }));
    expect(new Set([web.message.id, otherChannel.message.id, otherShop.message.id]).size).toBe(3);
    expect([web.aiJobId, otherChannel.aiJobId, otherShop.aiJobId]).toEqual([null, null, null]);
  });

  it('heals a genuine post-commit enqueue failure without inserting the message again', async () => {
    const enqueue = vi.spyOn(jobs, 'enqueue').mockRejectedValueOnce(new Error('test enqueue failure'));
    const input = inbound({ externalId: randomUUID() });
    const first = await saveMessage(input);
    expect(first).toMatchObject({ created: true, aiJobId: null });
    const replay = await saveMessage(input);
    expect(replay).toMatchObject({ created: false, aiJobId: null, message: { id: first.message.id } });
    await saveMessage(input);
    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(await db.maybeOne('SELECT id FROM jobs WHERE business_id=$1 AND dedup_key=$2',
      [shopA.id, 'ai.reply:' + first.message.id])).not.toBeNull();
    expect((await getHistory(first.conversation.id)).items).toHaveLength(1);
  });

  it('validates content and suppresses automatic jobs for non-live inbound or staff messages', async () => {
    await expect(saveMessage(inbound({ parts: [] }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(saveMessage(inbound({ parts: [{ type: 'action_buttons', buttons: [{
      id: 'link', label: 'Invalid link', action: { kind: 'link', url: 'javascript:alert(1)' },
    }] }] }))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const first = await saveMessage(inbound({ origin: 'broadcast' }));
    const staff = await saveMessage(inbound({ conversationId: first.conversation.id, author: 'staff', direction: 'outbound' }));
    expect(first.aiJobId).toBeNull();
    expect(staff.aiJobId).toBeNull();
    expect(staff.conversation.unreadCount).toBe(0);
    await expect(saveMessage(inbound({ conversationId: first.conversation.id, businessId: shopB.id })))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('serializes concurrent messages for one customer and opens a new chat after closure', async () => {
    const input = inbound({ triggerAi: false });
    const results = await Promise.all(Array.from({ length: 20 }, () => saveMessage(input)));
    const conversationIds = new Set(results.map(({ conversation }) => conversation.id));
    expect(conversationIds.size).toBe(1);
    const { conversation } = results[0]!;
    expect((await getHistory(conversation.id)).items.map(({ seq }) => seq)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    await db.query("UPDATE conversations SET status='closed', closed_at=now() WHERE id=$1 AND business_id=$2", [conversation.id, shopA.id]);
    const reopened = await saveMessage({ ...input, conversationId: conversation.id });
    expect(reopened.conversation.id).not.toBe(conversation.id);
    expect(reopened.conversation).toMatchObject({ status: 'open', unreadCount: 1 });
    expect(await getCustomerLastInboundAt(shopA.id, conversation.customerId)).toBe(reopened.message.createdAt);
    expect(await getCustomerLastInboundAt(shopB.id, conversation.customerId)).toBeNull();
  }, 30000);

  it('pages 95 ungrouped messages in ascending order without skipping or repeating', async () => {
    const input = inbound({ triggerAi: false });
    const { conversation } = await saveMessage(input);
    for (let written = 0; written < 94; written += 4) {
      const batch = Math.min(4, 94 - written);
      await Promise.all(Array.from({ length: batch }, () => saveMessage({ ...input, conversationId: conversation.id })));
    }
    const pages = [];
    let before: string | null = null;
    do {
      const page = await getHistory(conversation.id, { before, limit: 30 });
      pages.unshift(page.items.map(({ seq }) => seq));
      before = page.nextCursor;
    } while (before);
    expect(pages.map((page) => page.length)).toEqual([5, 30, 30, 30]);
    expect(pages.flat()).toEqual(Array.from({ length: 95 }, (_, index) => index + 1));
  }, 120000);

  it('retains group boundaries on older pages and validates cursor before looking up a conversation', async () => {
    const input = inbound({ triggerAi: false });
    const { conversation } = await saveMessage(input);
    const groupId = randomUUID();
    for (let index = 0; index < 5; index++) await saveMessage({ ...input, conversationId: conversation.id, groupId });
    const latest = await getHistory(conversation.id, { limit: 2 });
    expect(latest.items.map(({ seq }) => seq)).toEqual([2, 3, 4, 5, 6]);
    expect((await getHistory(conversation.id, { before: latest.nextCursor })).items.map(({ seq }) => seq)).toEqual([1]);
    const after = Buffer.from('2').toString('base64url');
    const live = await getHistory(conversation.id, { after, limit: 2 });
    expect(live.items.map(({ seq }) => seq)).toEqual([3, 4]);
    expect(Buffer.from(live.nextCursor!, 'base64url').toString()).toBe('4');
    for (const options of [{ before: '???' }, { after: 'MA' }, { before: after, after }, { limit: 0 }, { limit: 101 }, { limit: 1.5 }]) {
      await expect(getHistory(randomUUID(), options)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    }
    for (const id of [conversation.id, randomUUID(), 'bad-id']) {
      expect(await getConversation(id, { businessId: shopB.id })).toBeNull();
      expect(await getHistory(id, { businessId: shopB.id })).toEqual({ items: [], nextCursor: null });
    }
  });

  it('finds language across six meaningful customer messages and uses the scoped fallback', async () => {
    const input = inbound({ triggerAi: false });
    const { conversation } = await saveMessage(input);
    for (let index = 0; index < 5; index++) {
      await saveMessage({ ...input, conversationId: conversation.id, parts: [{ type: 'text', text: 'ok' }] });
    }
    expect(await getCustomerLanguage(conversation.id)).toBe('en');
    await saveMessage({ ...input, conversationId: conversation.id, parts: [{ type: 'text', text: 'ขอบคุณค่ะ' }] });
    expect(await getCustomerLanguage(conversation.id)).toBe('th');
    const account = SEED.accounts.find(({ alias }) => alias === shopB.accountAlias)!;
    const englishShop = await db.one<{ id: string }>("INSERT INTO businesses (account_id,name,language) VALUES ($1,$2,'en') RETURNING id",
      [account.id, 'English Test Shop']);
    expect(await getCustomerLanguage(conversation.id, { businessId: englishShop.id })).toBe('en');
    expect(await getCustomerLanguage(randomUUID(), { businessId: englishShop.id })).toBe('en');
    expect(await getCustomerLanguage('bad-id')).toBe('th');
    const image = await saveMessage(inbound({ triggerAi: false, parts: [{ type: 'image', fileId: randomUUID() }] }));
    expect(image.message.text).toBe('[รูปภาพ]');
    expect(await getCustomerLanguage(image.conversation.id)).toBe(shopA.language);
  });

  it('stores the fake AI reply and leaves the bot silent after takeover', async () => {
    const owner = await createTestAgent();
    await loginAs(owner, 'owner.a@example.test');
    const input = inbound({ parts: [{ type: 'text', text: 'A-GAME-01 ราคาเท่าไหร่' }] });
    const first = await saveMessage(input);
    await drainJobs();
    const history = await getHistory(first.conversation.id);
    expect(history.items.some(({ author }) => author === 'ai')).toBe(true);
    await assignConversation(first.conversation.id, SEED.users.find(({ alias }) => alias === 'staff_a')!.id, { businessId: shopA.id });
    await saveMessage({ ...input, conversationId: first.conversation.id });
    await drainJobs();
    const next = await getHistory(first.conversation.id);
    expect(next.items.filter(({ author }) => author === 'ai')).toHaveLength(history.items.filter(({ author }) => author === 'ai').length);
  }, 30000);

  it('scopes detail, history and read routes to the signed-in business', async () => {
    const owner = await createTestAgent();
    await loginAs(owner, 'owner.a@example.test');
    const { conversation } = await saveMessage(inbound({ triggerAi: false }));
    const resource = '/api/v1/conversations/';
    expect((await owner.get(resource + conversation.id)).status).toBe(200);
    expect((await owner.get(resource + conversation.id + '/messages')).body.data.items).toHaveLength(1);
    expect((await owner.post(resource + conversation.id + '/read').set('X-Requested-With', 'nless')).status).toBe(200);
    expect((await getConversation(conversation.id))?.unreadCount).toBe(0);
    const other = SEED.conversations.find(({ alias }) => alias === 'conv_b_ai')!.id;
    expect((await owner.get(resource + other)).status).toBe(404);
    expect((await owner.get(resource + other + '/messages')).status).toBe(404);
    expect((await owner.post(resource + other + '/read').set('X-Requested-With', 'nless')).status).toBe(404);
    const staffUser = await db.one<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id',
      [randomUUID() + '@example.test']);
    await db.query("INSERT INTO memberships (business_id,user_id,role) VALUES ($1,$2,'staff')", [shopA.id, staffUser.id]);
    const cookie = vi.fn();
    await createSession(staffUser.id, 'dev', { cookie } as unknown as Response);
    const [cookieName, cookieValue] = cookie.mock.calls[0]!;
    const session = cookieName + '=' + cookieValue;
    const staff = await createTestAgent();
    expect((await staff.get(resource + conversation.id).set('Cookie', session)).status).toBe(403);
    expect((await staff.get(resource + conversation.id + '/messages').set('Cookie', session)).status).toBe(403);
    expect((await staff.post(resource + conversation.id + '/read').set('Cookie', session).set('X-Requested-With', 'nless')).status).toBe(403);
  });
});

it('retains plain text and a fallback for every stored message part', () => {
  const fileId = randomUUID();
  const output = partsToText([
    { type: 'text', text: 'Hello' },
    { type: 'image', fileId },
    { type: 'file', fileId, fileName: 'rules.pdf', mimeType: 'application/pdf', sizeBytes: 1 },
    { type: 'product_card', items: [], altText: 'Demo Quest' },
    {
      type: 'order_review', proposalId: 'order', version: 1, lines: [], subtotalMinor: 149000,
      deliveryFeeMinor: 0, totalMinor: 149000, currency: 'THB', expiresAt: '2026-11-21T05:00:00Z', reviewToken: 'test',
    },
    {
      type: 'booking_review', proposalId: 'booking', version: 1, serviceName: 'Teach', resourceName: 'Demo',
      startAt: '2026-11-21T05:00:00Z', endAt: '2026-11-21T06:00:00Z', timezone: 'Asia/Bangkok',
      localDisplay: '12:00', expiresAt: '2026-11-21T05:00:00Z', reviewToken: 'test',
    },
    { type: 'action_buttons', text: 'Order', buttons: [{ id: '1', label: 'Confirm', action: { kind: 'postback', data: 'yes' } }] },
  ]);
  expect(output.split('\n')).toEqual([
    'Hello', '[รูปภาพ]', '[ไฟล์: rules.pdf]', 'Demo Quest', '[สรุปออเดอร์ ยอดรวม 1,490 บาท]',
    '[สรุปการจอง 12:00]', 'Order', '[ปุ่ม: Confirm]',
  ]);
});

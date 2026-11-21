import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import type { InboxRow } from '@nless/shared/features/inbox/types';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getConversation, getHistory, saveMessage } from './service';

const shop = SEED.businesses[0];

async function incoming(displayName: string, text: string, occurredAt?: string) {
  return saveMessage({
    businessId: shop.id, customer: { channel: 'web', externalId: 't-' + randomUUID(), displayName },
    direction: 'inbound', author: 'customer', parts: [{ type: 'text', text }], triggerAi: false, occurredAt,
  });
}

describe('F09 staff inbox', { timeout: 30000 }, () => {
  it('filters scoped results and pages tied conversation times without duplicates', async () => {
    const owner = await createTestAgent();
    await loginAs(owner, 'owner.a@example.test');
    const keyword = 'cursor-' + randomUUID();
    const timestamp = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const rows = await Promise.all(Array.from({ length: 5 }, (_, index) => incoming(keyword + index, 'literal % marker', timestamp)));
    const target = '/api/v1/businesses/' + shop.id + '/conversations';
    const waiting = await owner.get(target).query({ filter: 'waiting', search: keyword });
    expect(waiting.body.data.items).toHaveLength(5);
    expect((await owner.get(target).query({ assignee: 'xyz' })).status).toBe(400);
    expect(await (async () => {
      const result: InboxRow[] = [];
      let cursor: string | undefined;
      do {
        const page = await owner.get(target).query({ limit: 2, filter: 'unknown', search: keyword, cursor });
        expect(page.status).toBe(200);
        result.push(...page.body.data.items);
        cursor = page.body.data.nextCursor ?? undefined;
      } while (cursor);
      return result.map(({ conversationId }) => conversationId).sort();
    })()).toEqual(rows.map(({ conversation }) => conversation.id).sort());
    const literal = await owner.get(target).query({ search: '%' });
    expect(literal.body.data.items.map(({ conversationId }: InboxRow) => conversationId).sort())
      .toEqual(rows.map(({ conversation }) => conversation.id).sort());
    expect((await owner.get(target + '/counts')).body.data.active).toBeGreaterThanOrEqual(5);
  });

  it('takes over before a staff send and deduplicates browser retries', async () => {
    const owner = await createTestAgent();
    await loginAs(owner, 'owner.a@example.test');
    const { conversation } = await incoming('Staff reply fixture', 'Please help');
    const target = '/api/v1/conversations/' + conversation.id + '/staff-messages';
    const input = { clientRequestId: randomUUID(), text: 'I can help with that.' };
    const first = await owner.post(target).set('X-Requested-With', 'nless').send(input);
    const second = await owner.post(target).set('X-Requested-With', 'nless').send(input);
    expect(first.status).toBe(200);
    expect(second.body.data.messageId).toBe(first.body.data.messageId);
    expect((await getConversation(conversation.id))?.handler).toBe('human');
    expect((await getHistory(conversation.id)).items.filter(({ author }) => author === 'staff')).toHaveLength(1);

    const staff = await createTestAgent();
    await loginAs(staff, 'staff.a@example.test');
    const conflict = await staff.post(target).set('X-Requested-With', 'nless')
      .send({ clientRequestId: randomUUID(), text: 'Second reply' });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details.holder.displayName).toBe('Owner A');

    const other = SEED.conversations.find(({ alias }) => alias === 'conv_b_ai')!;
    const scoped = await owner.post('/api/v1/conversations/' + other.id + '/staff-messages')
      .set('X-Requested-With', 'nless').send(input);
    expect(scoped.status).toBe(404);
  });
});

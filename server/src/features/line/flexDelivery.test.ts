import { randomBytes, randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import type { OrderReviewPart } from '@nless/shared/core/types';
import { expect, test } from 'vitest';
import { db, decryptSecret, type OutboundDelivery } from '../../core';
import { saveMessage } from '../inbox/service';
import { toLineMessages } from './outbound';

test('builds a localized LINE review with durable, encrypted and stable confirmation actions', async () => {
  const businessId = SEED.businesses.find((shop) => shop.alias === 'biz_demo_a')!.id;
  const customer = { channel: 'line' as const, externalId: 'U' + randomBytes(16).toString('hex'), channelAccountId: 'Ufixture', displayName: 'Fixture' };
  const { conversation } = await saveMessage({
    businessId, customer, author: 'customer', direction: 'inbound',
    parts: [{ type: 'text', text: 'Please confirm my board game order' }], externalId: randomUUID(), triggerAi: false,
  });
  const part: OrderReviewPart = {
    type: 'order_review', proposalId: 'fixture-proposal', version: 1, currency: 'THB',
    reviewToken: 'synthetic-line-review-token', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    lines: [{ itemId: 'fixture-item', sku: 'A-GAME-01', name: 'Demo Quest', quantity: 2,
      variantId: null, unitPriceMinor: 149_000, lineTotalMinor: 298_000 }],
    subtotalMinor: 298_000, deliveryFeeMinor: 0, totalMinor: 298_000,
  };
  const { message } = await saveMessage({
    businessId, conversationId: conversation.id, author: 'ai', direction: 'outbound', parts: [part],
  });
  const delivery: OutboundDelivery = {
    businessId, channel: 'line', customerExternalId: customer.externalId, channelAccountId: customer.channelAccountId,
    conversationId: conversation.id, messageId: message.id, parts: [part], lastInboundMeta: {}, attempt: 1,
  };

  const formatted = await toLineMessages(delivery);
  expect(formatted).toEqual(await toLineMessages({ ...delivery, attempt: 2 }));
  expect(formatted).toHaveLength(1);
  expect(formatted[0]).toMatchObject({ type: 'flex', altText: expect.stringContaining('Order summary') });
  const serialized = JSON.stringify(formatted);
  expect(serialized).toContain('Confirm order');
  expect(serialized).not.toContain(part.reviewToken);

  const actions = await db.query<{ id: string; decision: string; review_token_enc: string }>(
    'SELECT id, decision, review_token_enc FROM line_actions WHERE business_id = $1 AND conversation_id = $2 ORDER BY decision',
    [businessId, conversation.id],
  );
  expect(actions.rows.map((row) => row.decision)).toEqual(['cancel', 'confirm']);
  for (const row of actions.rows) {
    expect(serialized).toContain('nl:a:' + row.id);
    expect(row.review_token_enc).toMatch(/^enc:v1:/);
    expect(decryptSecret(row.review_token_enc)).toBe(part.reviewToken);
  }
}, 20_000);

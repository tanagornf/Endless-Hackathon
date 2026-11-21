import { describe, expect, it, vi } from 'vitest';
import { config, db, type OutboundDelivery } from '../../core';
import * as inbox from '../inbox/service';
import { splitLineText, toLineMessages } from './outbound';

describe('LINE outbound text', () => {
  it('keeps emoji-heavy messages within the provider UTF-16 limit without breaking surrogate pairs', () => {
    const original = '🎲'.repeat(5_000);
    const chunks = splitLineText(original);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((part) => part.length <= 4_800)).toBe(true);
    expect(chunks.every((part) => !/[\uD800-\uDBFF]$/.test(part) && !/^[\uDC00-\uDFFF]/.test(part))).toBe(true);
    expect(chunks.join('')).toBe(original);
  });
});

it('preserves the customer reply when its photo cannot be signed or loaded for this shop', async () => {
  const originalBaseUrl = config.PUBLIC_BASE_URL;
  const language = vi.spyOn(inbox, 'getCustomerLanguage').mockResolvedValue('en');
  const load = vi.spyOn(db, 'maybeOne').mockResolvedValue(null);
  const parts = [
    { type: 'text', text: 'The case costs 490 baht and is sold out.' },
    { type: 'image', fileId: '10000000-0000-4000-8000-000000000001' },
  ] satisfies OutboundDelivery['parts'];
  const delivery: OutboundDelivery = {
    businessId: 'shop', conversationId: 'conversation', channel: 'line', customerExternalId: 'Utest',
    channelAccountId: 'Ubot', messageId: 'message', attempt: 1, parts, lastInboundMeta: {},
  };
  const expected = [parts[0], { type: 'text', text: '[Image unavailable]' }];

  try {
    config.PUBLIC_BASE_URL = 'http://localhost:3000';
    expect(await toLineMessages(delivery)).toEqual(expected);
    expect(load).not.toHaveBeenCalled();
    config.PUBLIC_BASE_URL = 'https://shop.example.test';
    expect(await toLineMessages(delivery)).toEqual(expected);
    expect(load).toHaveBeenCalledWith(expect.stringContaining('f.business_id = $2'),
      [parts[1].fileId, delivery.businessId, 'image', delivery.messageId, delivery.conversationId]);
  } finally {
    config.PUBLIC_BASE_URL = originalBaseUrl;
    language.mockRestore();
    load.mockRestore();
  }
});

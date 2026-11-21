import type { MessageRecord } from '@nless/shared/features/inbox/types';
import { describe, expect, it } from 'vitest';
import { buildModelHistory, MODEL_HISTORY_LIMIT } from './historyWindow';

function message(
  seq: number,
  text: string,
  author: MessageRecord['author'] = 'customer',
  parts: MessageRecord['parts'] = [{ type: 'text', text }],
): MessageRecord {
  return {
    id: String(seq), businessId: 'test-shop', conversationId: 'test-chat', seq,
    direction: author === 'customer' ? 'inbound' : 'outbound', author, authorUserId: null,
    text, parts, channel: 'web', origin: 'live', externalId: null, groupId: null,
    delivery: { mode: null, state: 'pending', externalRef: null, error: null },
    createdAt: '2026-11-21T00:00:00Z',
  };
}

describe('buildModelHistory', () => {
  it('keeps the newest 40 records through the trigger in chronological order without duplication', () => {
    const history = Array.from({ length: 52 }, (_, index) => message(index + 1, 'message ' + (index + 1)));
    const result = buildModelHistory(history, history[49]);
    expect(result.messages).toHaveLength(MODEL_HISTORY_LIMIT);
    expect(result.messages.map(({ content }) => content)).toEqual(history.slice(10, 50).map(({ text }) => text));
    expect(result.cardMasked).toBe(false);
  });

  it('keeps the trigger even when the fetched page does not include it', () => {
    const inbound = message(12, 'How much is it?');
    const result = buildModelHistory([message(11, 'A-GAME-01'), message(13, 'A-SOLD-01')], inbound);
    expect(result.messages.map(({ content }) => content)).toEqual(['A-GAME-01', inbound.text]);
  });

  it('limits each message to 4,000 and spends the 24,000 character budget newest first', () => {
    const history = Array.from({ length: 7 }, (_, index) => message(index + 1, String(index + 1).repeat(4_500)));
    const inbound = message(8, 'x'.repeat(1_000));
    const result = buildModelHistory(history, inbound);
    expect(result.messages.map(({ content }) => content)).toEqual([
      '2'.repeat(3_000),
      ...['3', '4', '5', '6', '7'].map((digit) => digit.repeat(4_000)),
      inbound.text,
    ]);
    expect(result.messages.reduce((length, { content }) => length + content.length, 0)).toBe(24_000);
  });

  it('preserves Thai and English questions at the ends of long inbounds', () => {
    for (const [intro, detail, question] of [
      ['ขอรายละเอียดเกมนี้ค่ะ', 'ลูกค้าต้องการตรวจสอบข้อมูลเพิ่มเติม ', 'แล้วเกมนี้ยังมีของไหมคะ?'],
      ['About this game:', 'Here is some background about the item. ', 'Can you confirm it is still in stock?'],
    ]) {
      const inbound = message(1, intro + '\n' + detail.repeat(240) + '\n' + question);
      const content = buildModelHistory([], inbound).messages[0].content as string;
      expect(content.length).toBeLessThanOrEqual(4_000);
      expect(content).toContain('\n…\n');
      expect(content.startsWith(intro)).toBe(true);
      expect(content.endsWith(question)).toBe(true);
    }
  });

  it('truncates at grapheme boundaries for Thai combining marks and emoji', () => {
    for (const cluster of ['ก้', '😀', '👩‍💻']) {
      const prefix = 'a'.repeat(3_999);
      const inbound = message(2, 'คำถามใหม่');
      const history = [message(1, prefix + cluster + 'tail')];
      expect(buildModelHistory(history, inbound).messages[0].content).toBe(prefix);
    }
    const newest = message(1, 'a'.repeat(1_997) + 'ก้' + 'b'.repeat(4_000) + '👩‍💻' + 'c'.repeat(1_997));
    const content = buildModelHistory([], newest).messages[0].content;
    expect(content).toBe('a'.repeat(1_997) + '\n…\n' + 'c'.repeat(1_997));
  });

  it('masks full card numbers before clipping for customer, staff, and AI echoes', () => {
    const prefix = 'x'.repeat(3_990) + ' ';
    const sampleCard = '4111 1111 1111 1111';
    const thaiCard = '๔๑๑๑-๑๑๑๑-๑๑๑๑-๑๑๑๑';
    const inbound = message(4, 'Confirm ' + thaiCard);
    const history = [
      message(1, prefix + sampleCard),
      message(2, 'Staff saw ' + sampleCard, 'staff'),
      message(3, 'AI saw ' + thaiCard, 'ai'),
    ];
    expect(buildModelHistory(history, inbound)).toEqual({
      cardMasked: true,
      messages: [
        { role: 'user', content: prefix + '[บัตร •••' },
        { role: 'assistant', content: 'Staff saw [บัตร •••• 1111]' },
        { role: 'assistant', content: 'AI saw [บัตร •••• 1111]' },
        { role: 'user', content: 'Confirm [บัตร •••• 1111]' },
      ],
    });
  });

  it('projects only text and safe summary placeholders and excludes system messages', () => {
    const inbound = message(5, '', 'customer', [{ type: 'text', text: 'New question' }]);
    const history = [
      message(1, 'private note', 'system'),
      message(2, 'raw searchable attachment', 'customer', [
        { type: 'file', fileId: 'internal-file-id', fileName: 'private.pdf', mimeType: 'application/pdf', sizeBytes: 20 },
      ]),
      message(3, 'raw searchable summary', 'staff', [
        { type: 'text', text: 'Shop response' },
        {
          type: 'order_review', proposalId: 'internal-order-id', version: 1, lines: [], subtotalMinor: 1,
          deliveryFeeMinor: 1, totalMinor: 2, currency: 'THB', expiresAt: '', reviewToken: 'synthetic-order-token',
        },
        { type: 'text', text: 'Please review' },
      ]),
      message(4, 'raw searchable summary', 'ai', [
        {
          type: 'booking_review', proposalId: 'internal-booking-id', version: 1, serviceName: 'service', resourceName: 'staff',
          startAt: '', endAt: '', timezone: 'Asia/Bangkok', localDisplay: '', expiresAt: '', reviewToken: 'synthetic-booking-token',
        },
      ]),
    ];
    expect(buildModelHistory(history, inbound)).toEqual({
      cardMasked: false,
      messages: [
        { role: 'assistant', content: 'Shop response\n[การ์ดสรุป]\nPlease review' },
        { role: 'assistant', content: '[การ์ดสรุป]' },
        { role: 'user', content: 'New question' },
      ],
    });
  });
});

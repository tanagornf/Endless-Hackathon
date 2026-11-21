import type { ActionButtonsPart, BookingReviewPart, OrderReviewPart, ProductCardItem } from '@nless/shared/core/types';
import { describe, expect, it } from 'vitest';
import { formatLineFlexDelivery, type LineFlexOptions, type LineProposalActionRequest } from './flex';

const confirmData = 'nl:a:Confirm00001';
const cancelData = 'nl:a:Cancel000001';

function render(parts: Parameters<typeof formatLineFlexDelivery>[0], options: LineFlexOptions = { language: 'en' }) {
  return formatLineFlexDelivery(parts, options, (part) => part.type === 'text' ? [part] : []);
}

function product(index: number, overrides: Partial<ProductCardItem> = {}): ProductCardItem {
  return {
    itemId: `item-${index}`,
    sku: `SKU-${index}`,
    variantId: null,
    name: `Game ${index}`,
    unitPriceMinor: 149_000,
    currency: 'THB',
    available: null,
    soldOut: false,
    version: 1,
    ...overrides,
  };
}

function quickButtons(count: number): ActionButtonsPart {
  return {
    type: 'action_buttons',
    buttons: Array.from({ length: count }, (_, index) => ({
      id: String(index),
      label: '🧩'.repeat(21),
      action: { kind: 'postback', data: `${index} ${'🧩'.repeat(310)}` },
    })),
  };
}

const order: OrderReviewPart = {
  type: 'order_review',
  proposalId: 'order-internal-id',
  version: 3,
  reviewToken: 'order-internal-token',
  expiresAt: '2026-11-21T18:05:00Z',
  lines: Array.from({ length: 9 }, (_, index) => ({
    itemId: `item-${index}`,
    variantId: null,
    sku: `SKU-${index}`,
    name: `Line ${index}`,
    quantity: 2,
    unitPriceMinor: 1_025,
    lineTotalMinor: 2_050,
  })),
  subtotalMinor: 18_450,
  deliveryFeeMinor: 1_000,
  totalMinor: 19_450,
  currency: 'THB',
};

const booking: BookingReviewPart = {
  type: 'booking_review',
  proposalId: 'booking-internal-id',
  version: 2,
  reviewToken: 'booking-internal-token',
  expiresAt: '2026-11-21T18:05:00Z',
  serviceName: 'Game lesson',
  resourceName: 'Instructor',
  startAt: '2026-11-22T03:00:00Z',
  endAt: '2026-11-22T03:30:00Z',
  timezone: 'Asia/Bangkok',
  localDisplay: '22 Nov 10:00 Asia/Bangkok',
};

describe('LINE Flex conversion', () => {
  it('builds the Thai product carousel with scoped media and stock-specific actions', async () => {
    const resolved: string[] = [];
    const messages = await render([{
      type: 'product_card',
      items: [
        product(1, { name: 'เกม', available: 5, imageFileId: 'file-one' }),
        product(2, { soldOut: true, available: 0, unitPriceMinor: 9_950, imageFileId: 'file-missing' }),
        product(3, { available: 6, imageFileId: 'file-unsafe' }),
      ],
      altText: '🧩'.repeat(401),
    }], {
      language: 'th',
      resolveSquareImage: async (id) => {
        resolved.push(id);
        if (id === 'file-one') return 'https://example.test/game.png';
        return id === 'file-missing' ? null : 'http://example.test/game.png';
      },
    });

    expect(resolved).toEqual(['file-one', 'file-missing', 'file-unsafe']);
    expect(messages).toMatchObject([{
      type: 'flex', altText: '🧩'.repeat(400),
      contents: {
        type: 'carousel',
        contents: [
          {
            size: 'kilo',
            hero: { type: 'image', aspectRatio: '1:1', aspectMode: 'cover', url: 'https://example.test/game.png' },
            body: { contents: [{ text: 'เกม', weight: 'bold', wrap: true, maxLines: 2 }, { text: '฿1,490' }, { text: 'เหลือ 5 ชิ้น' }] },
            footer: { contents: [{ action: { type: 'message', label: 'สนใจ', text: 'สนใจ เกม' } }] },
          },
          { size: 'kilo', body: { contents: [{ text: 'Game 2' }, { text: '฿99.50' }, { text: 'สินค้าหมด', color: expect.stringMatching(/^#[A-Fa-f0-9]{6}$/) }] } },
          { size: 'kilo', body: { contents: [{ text: 'Game 3' }, { text: '฿1,490' }] } },
        ],
      },
    }]);
    expect(JSON.stringify(messages).match(/"hero"/g)).toHaveLength(1);
    expect(JSON.stringify(messages).match(/"footer"/g)).toHaveLength(2);
  });

  it('keeps all product cards in order across the 10-bubble boundary', async () => {
    const items = Array.from({ length: 12 }, (_, index) => product(index + 1));
    const messages = await render([{ type: 'product_card', items, altText: 'Catalog' }]);
    expect(messages).toMatchObject([
      { contents: { type: 'carousel', contents: items.slice(0, 10).map((item) => ({ body: { contents: [{ text: item.name }, { text: '฿1,490' }] } })) } },
      { contents: { type: 'carousel', contents: items.slice(10).map((item) => ({ body: { contents: [{ text: item.name }, { text: '฿1,490' }] } })) } },
    ]);
    const single = await render([{ type: 'product_card', items: [product(1, { soldOut: true })], altText: 'Catalog' }]);
    expect(single).toMatchObject([{ contents: { type: 'bubble', body: { contents: [{ text: 'Game 1' }, { text: '฿1,490' }, { text: 'Sold out' }] } } }]);
  });

  it('splits carousels by UTF-8 size without dropping the overflow card', async () => {
    const items = [1, 2, 3].map((index) => product(index, { name: `${index}${'ก'.repeat(6_000)}` }));
    const messages = await render([{ type: 'product_card', items, altText: 'Catalog' }]);
    expect(messages).toMatchObject([
      { contents: { type: 'carousel', contents: items.slice(0, 2).map((item) => ({ body: { contents: [expect.objectContaining({ text: item.name }), expect.anything()] } })) } },
      { contents: { type: 'bubble', body: { contents: [expect.objectContaining({ text: items[2]!.name }), expect.anything()] } } },
    ]);
    expect(messages.every((message) => Buffer.byteLength(JSON.stringify(message)) <= 45_000)).toBe(true);
  });

  it('trims an oversized single product bubble before sending it', async () => {
    const messages = await render([{
      type: 'product_card',
      items: [product(1, { name: 'ก'.repeat(11_000) })],
      altText: 'Catalog',
    }]);
    expect(messages).toMatchObject([{ type: 'flex', contents: { type: 'bubble' } }]);
    expect(Buffer.byteLength(JSON.stringify(messages[0]))).toBeLessThan(30_000);
    expect(JSON.stringify(messages)).toContain('฿1,490');
  });

  it('renders English order and booking summaries with only resolved postback data', async () => {
    const requests: LineProposalActionRequest[] = [];
    const messages = await render([order, booking], {
      language: 'en',
      resolveActionData: async (request) => {
        requests.push(request);
        return request.decision === 'confirm' ? confirmData : cancelData;
      },
    });
    const reviewFooter = (label: string) => ({ contents: [
      { style: 'primary', action: { type: 'postback', label, displayText: label, data: confirmData } },
      { action: { type: 'postback', label: 'Cancel', displayText: 'Cancel', data: cancelData } },
    ] });
    expect(messages).toMatchObject([
      { type: 'flex', altText: 'Order summary, total ฿194.50. Open in the LINE app to confirm.',
        contents: { type: 'bubble', header: { contents: [{ text: 'Order summary' }] }, footer: reviewFooter('Confirm order') } },
      { type: 'flex', altText: 'Booking summary 22 Nov 10:00 Asia/Bangkok. Open in the LINE app to confirm.',
        contents: { type: 'bubble', body: { contents: [{ text: booking.serviceName }, { text: booking.resourceName }, { text: booking.localDisplay, weight: 'bold' }] },
          footer: reviewFooter('Confirm booking') } },
    ]);
    const payload = JSON.stringify(messages);
    for (const text of ['Line 7 × 2', 'and 1 more', '฿20.50', '฿184.50', '฿10', '฿194.50', 'Confirm before 22 Nov 01:05']) {
      expect(payload).toContain(text);
    }
    expect(payload).not.toContain('Line 8');
    expect(payload).not.toMatch(/internal-(?:id|token)/u);
    expect(payload.replaceAll('฿', '')).not.toMatch(/[\u0E00-\u0E7F]/u);
    expect(requests).toEqual([order, order, booking, booking].map((part, index) => ({
      source: 'review', kind: part.type === 'order_review' ? 'order' : 'booking', proposalId: part.proposalId,
      version: part.version, reviewToken: part.reviewToken, expiresAt: part.expiresAt, decision: index % 2 === 0 ? 'confirm' : 'cancel',
    })));
  });

  it('falls back to localized plain text when the trimmed order bubble remains too large', async () => {
    const messages = await render([{ ...order, lines: order.lines.map((line) => ({ ...line, name: '🧩'.repeat(7_000) })) }], { language: 'th' });
    expect(messages).toEqual([{ type: 'text', text: 'สรุปออเดอร์ รวม ฿194.50 เปิดดูในแอป LINE เพื่อยืนยัน' }]);
  });

  it('puts up to thirteen ordinary quick replies on the final rendered message only', async () => {
    const messages = await render([
      { type: 'text', text: 'Before' },
      quickButtons(13),
      { type: 'product_card', items: [product(1)], altText: 'Catalog' },
    ]);
    expect(messages[0]).toEqual({ type: 'text', text: 'Before' });
    expect(messages[1]).toMatchObject({ type: 'flex', quickReply: { items: Array.from({ length: 13 }, (_, index) => ({
      type: 'action', action: { type: 'message', label: '🧩'.repeat(20), text: `${index} ${'🧩'.repeat(299 - String(index).length)}` },
    })) } });
    expect(await render([quickButtons(5)], { language: 'th' })).toMatchObject([
      { type: 'text', text: 'เลือกได้เลยค่ะ', quickReply: { items: expect.arrayContaining([expect.anything()]) } },
    ]);
  });

  it('keeps a valid Flex envelope when attaching quick replies would oversize it', async () => {
    const items = [1, 2].map((index) => product(index, { name: `${index}${'ก'.repeat(6_000)}` }));
    const messages = await render([
      { type: 'product_card', items, altText: 'Catalog' },
      quickButtons(13),
    ]);

    expect(messages).toMatchObject([
      { type: 'flex', contents: { type: 'carousel' } },
      { type: 'text', text: 'Please choose an option.' },
    ]);
    expect(messages[0]?.quickReply).toBeUndefined();
    expect(messages[1]?.quickReply?.items).toHaveLength(13);
    expect(Buffer.byteLength(JSON.stringify(messages[0]))).toBeLessThanOrEqual(45_000);
  });

  it('uses a Flex button footer for a non-quick part and keeps only valid actions', async () => {
    const requests: LineProposalActionRequest[] = [];
    const messages = await render([{
      type: 'action_buttons',
      text: 'Choose',
      buttons: [
        { id: 'order', label: 'Confirm', action: { kind: 'confirm_proposal', proposalId: order.proposalId, version: order.version, reviewToken: order.reviewToken, decision: 'confirm' } },
        { id: 'long', label: '🧩'.repeat(21), action: { kind: 'postback', data: 'x'.repeat(301) } },
        { id: 'invalid', label: 'Invalid', action: { kind: 'link', url: 'http://example.test' } },
        { id: 'valid', label: 'Details', action: { kind: 'link', url: 'https://example.test/details' } },
        { id: 'fifth', label: 'Fifth', action: { kind: 'postback', data: 'Fifth' } },
      ],
    }], { language: 'en', resolveActionData: (request) => { requests.push(request); return confirmData; } });
    expect(requests).toEqual([{ source: 'button', proposalId: order.proposalId, version: order.version, reviewToken: order.reviewToken, decision: 'confirm' }]);
    expect(messages).toMatchObject([{ type: 'flex', contents: { footer: { contents: [
      { action: { type: 'postback', label: 'Confirm', displayText: 'Confirm', data: confirmData } },
      { action: { type: 'message', label: '🧩'.repeat(20), text: '🧩'.repeat(21) } },
      { action: { type: 'uri', label: 'Details', uri: 'https://example.test/details' } },
    ] } } }]);
    expect(await render([quickButtons(14)])).toMatchObject([{ type: 'flex', contents: { footer: { contents: Array(4).fill(expect.anything()) } } }]);
  });

  it('does not serialize unrecognized action data', async () => {
    const messages = await render([booking], { language: 'en', resolveActionData: () => booking.reviewToken });
    expect(JSON.stringify(messages)).not.toMatch(/"postback"|booking-internal-token/);
  });
});

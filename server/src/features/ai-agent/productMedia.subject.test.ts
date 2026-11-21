import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { CatalogItemDetail } from '@nless/shared/features/catalog/types';
import { storage } from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import * as catalog from '../catalog/service';
import { saveMessage } from '../inbox/service';
import type { PriceEvidence } from './context';
import { getReplyProductImages } from './productMedia';
import { generateReply } from './service';

const businessId = seedId('biz_demo_a');
const photoMime = 'image/png';
const product = (sku: string, name: string) => {
  const id = randomUUID();
  const fileId = randomUUID();
  const quote = {
    itemId: id, variantId: null, sku, name, quantity: 1, currency: 'THB' as const,
    unitPriceMinor: 149000, subtotalMinor: 149000, available: 5, soldOut: false, version: 1,
  };
  const evidence: PriceEvidence = {
    id: 'catalog:' + id + ':v1', quote, name, variant: null, names: [name], itemSku: sku, itemNames: [name],
  };
  const item: CatalogItemDetail = {
    id, businessId, sku, name, nameEn: name, kind: 'product', priceMinor: 149000, currency: 'THB', stock: 5,
    shippable: true, durationMinutes: null, active: true, version: 1,
    description: null, category: null, unit: 'item', images: [{ fileId, alt: '' }], variants: [],
  };
  return { item, evidence, fileId, ref: { itemId: id, sku, name } };
};
const previous = product('A-GAME-01', 'Quest');
const current = product('A-CARD-01', 'Demo Cards card set');

async function evaluate(unanswered: string[], skus: string[]) {
  const details = vi.spyOn(catalog, 'getCatalogItemDetails').mockResolvedValue([previous.item, current.item]);
  const read = vi.spyOn(storage, 'read').mockImplementation(async (id) => ({
    file: { id, businessId, purpose: 'catalog', originalName: 'photo.png', mimeType: photoMime,
      sizeBytes: 1, sha256: 'fixture', createdAt: new Date(0).toISOString() },
    bytes: Buffer.from([1]),
  }));
  const images = await getReplyProductImages(businessId, {
    catalogRequest: { text: unanswered.join(' '), skus, previousSkus: ['A-GAME-01'], linkedSameProduct: false },
    unanswered, prices: [previous.evidence, current.evidence],
  }, { parts: [], productRefs: [previous.ref, current.ref] }, new AbortController().signal);
  return { images, details, read };
}

afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

describe('F10 photo current subject', () => {
  it.each([
    ['explicit unknown SKU', ['How much is A-GAME-01?', 'Show me ZZZ-SMOKE-UNKNOWN-914.'], ['A-GAME-01', 'ZZZ-SMOKE-UNKNOWN-914']],
    ['unrelated quote for a named unknown', ['How much is Quest Deluxe?'], []],
    ['held SKU beside a new topic', ['How much is A-GAME-01?', 'When do you close?'], ['A-GAME-01']],
  ] as const)('omits a photo for %s', async (_name, messages, skus) => {
    const { images, details, read } = await evaluate([...messages], [...skus]);
    expect(images).toEqual([]);
    expect(details).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it('only attaches the current SKU when the turn also has older catalog evidence', async () => {
    const { images, details } = await evaluate(['How much is A-GAME-01?', 'How much is A-CARD-01?'], ['A-GAME-01', 'A-CARD-01']);
    expect(images).toEqual([{ type: 'image', fileId: current.fileId, alt: current.item.name }]);
    expect(details).toHaveBeenCalledExactlyOnceWith(businessId, [current.item.id]);
  });

  it('uses an exact current name when another product also has evidence', async () => {
    const { images } = await evaluate(['How much is Demo Cards card set?'], []);
    expect(images).toEqual([{ type: 'image', fileId: current.fileId, alt: current.item.name }]);
  });

  it('keeps the one grounded item for a true immediate follow-up', async () => {
    const { images } = await evaluate(['How much is it?'], ['A-GAME-01']);
    expect(images).toEqual([{ type: 'image', fileId: previous.fileId, alt: previous.item.name }]);
  });
});

async function ask(text: string) {
  const { conversation, message } = await saveMessage({
    businessId, customer: { channel: 'web', externalId: 'f10-product-photo-' + randomUUID() },
    direction: 'inbound', author: 'customer', origin: 'demo', triggerAi: false, parts: [{ type: 'text', text }],
  });
  return generateReply(conversation.id, { triggerMessageId: message.id });
}

describe('F10 explicit photo and stock', () => {
  it('shows an approved stored picture when the buyer asks for a photo by SKU', async () => {
    const item = (await catalog.getProduct(businessId, { sku: 'A-GAME-01' }))!;
    const [details] = await catalog.getCatalogItemDetails(businessId, [item.id]);
    const file = await storage.save({
      businessId, uploadedBy: null, purpose: 'catalog', originalName: 'game.png', mimeType: photoMime,
      bytes: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'),
    });
    vi.spyOn(catalog, 'getCatalogItemDetails').mockResolvedValue([{ ...details, images: [{ fileId: file.id, alt: '' }] }]);
    const name = item.nameEn ?? item.name;
    expect((await ask('Show me a picture of A-GAME-01.')).reply).toMatchObject({
      parts: [{ type: 'text', text: 'This is ' + name + '.' }, { type: 'image', fileId: file.id, alt: name }],
      evidenceIds: ['catalog:' + item.id + ':v' + item.version],
    });
  });

  it('truthfully reports a product is sold out when asked only about availability', async () => {
    const result = await ask('Is A-SOLD-01 in stock?');
    const texts = result.reply.parts.flatMap((part) => part.type === 'text' ? [part.text] : []);
    expect(texts.join(' ')).toContain('is sold out.');
    expect(result.reply.evidenceIds).toEqual([expect.stringMatching(/^catalog:/)]);
  });
});

import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import type { TextPart } from '@nless/shared/core/types';
import type { CatalogItemDetail } from '@nless/shared/features/catalog/types';
import { storage } from '../../core';
import * as catalog from '../catalog/service';
import type { PriceEvidence } from './context';
import { getReplyProductImages } from './productMedia';

const shopA = randomUUID();
const shopB = randomUUID();
const sku = 'MEDIA-CASE-01';
const variantSku = 'MEDIA-CASE-01-BLUE';
const itemA = item(shopA, 2);
const itemB = item(shopB);

function item(businessId: string, imageCount = 1): CatalogItemDetail {
  return {
    id: randomUUID(), businessId, sku, kind: 'product', name: 'Case', nameEn: 'Case', priceMinor: 39000,
    currency: 'THB', stock: 5, shippable: true, durationMinutes: null, active: true, version: 1,
    description: null, category: null, unit: 'item',
    images: Array.from({ length: imageCount }, () => ({ fileId: randomUUID(), alt: '' })),
    variants: [{
      id: randomUUID(), sku: variantSku, name: 'Blue', priceMinor: 49000, stock: 0,
      effectivePriceMinor: 49000, effectiveStock: 0,
    }],
  };
}

function request(item: CatalogItemDetail, requestedSku = variantSku) {
  const { id: itemId } = item;
  const variant = item.variants[0];
  const price: PriceEvidence = {
    id: 'catalog:' + itemId + ':v1', name: item.name, variant: variant.name, names: [item.name],
    itemSku: item.sku, itemNames: [item.name],
    quote: {
      itemId, variantId: variant.id, sku: variantSku, name: item.name, quantity: 1, currency: 'THB',
      unitPriceMinor: variant.effectivePriceMinor, subtotalMinor: variant.effectivePriceMinor,
      available: variant.effectiveStock, soldOut: true, version: item.version,
    },
  };
  const context = {
    catalogRequest: { skus: [requestedSku], previousSkus: [], linkedSameProduct: false, text: requestedSku },
    prices: [price],
  };
  const draft = {
    parts: [{ type: 'text', text: 'The blue case costs 490 baht and is sold out.' } satisfies TextPart],
    productRefs: [{ itemId, sku: variantSku, name: item.name }],
  };
  return { context, draft };
}

function stored(fileId: string, businessId: string) {
  return {
    file: {
      id: fileId, businessId, purpose: 'catalog', originalName: 'case.png', mimeType: 'image/png',
      sizeBytes: 1, sha256: 'fixture', createdAt: new Date(0).toISOString(),
    },
    bytes: Buffer.from([1]),
  };
}

function imagesFor(product: CatalogItemDetail, requestedSku?: string, signal = new AbortController().signal) {
  const { context, draft } = request(product, requestedSku);
  return getReplyProductImages(product.businessId, context, draft, signal);
}

afterEach(() => vi.restoreAllMocks());

it('uses the exact variant quote and tenant even when both shops share an SKU', async () => {
  const details = vi.spyOn(catalog, 'getCatalogItemDetails').mockResolvedValue([itemA, itemB]);
  const otherShopFile = itemB.images[0].fileId;
  const ownFile = itemA.images[1].fileId;
  const read = vi.spyOn(storage, 'read').mockImplementation(async (id, { businessId }) => {
    if (businessId === shopA && id === ownFile) return stored(id, shopA);
    if (businessId === shopB && id === otherShopFile) return stored(id, shopB);
    return null;
  });

  expect(await imagesFor(itemA, variantSku.toLowerCase())).toEqual([{ type: 'image', fileId: ownFile, alt: 'Case' }]);
  expect(await imagesFor(itemB)).toEqual([{ type: 'image', fileId: otherShopFile, alt: 'Case' }]);
  expect(details.mock.calls).toEqual([[shopA, [itemA.id]], [shopB, [itemB.id]]]);
  expect(read).not.toHaveBeenCalledWith(otherShopFile, { businessId: shopA });

  details.mockClear();
  expect(await imagesFor(itemA, 'MEDIA-CASE-01-BLUE-EXTRA')).toEqual([]);
  expect(details).not.toHaveBeenCalled();
});

it('omits absent, unreadable, or stale media and keeps the guarded text', async () => {
  const details = vi.spyOn(catalog, 'getCatalogItemDetails').mockResolvedValue([{ ...itemA, images: [] }]);
  const read = vi.spyOn(storage, 'read').mockRejectedValue(new Error('Upload file removed'));
  const { context, draft } = request(itemA);
  const signal = new AbortController().signal;
  expect(await getReplyProductImages(shopA, context, draft, signal)).toEqual([]);
  expect(read).not.toHaveBeenCalled();

  details.mockResolvedValue([itemA]);
  expect(await getReplyProductImages(shopA, context, draft, signal)).toEqual([]);
  expect(read).toHaveBeenCalledTimes(itemA.images.length);
  read.mockClear();
  details.mockResolvedValue([{ ...itemA, variants: [] }]);
  expect(await getReplyProductImages(shopA, context, draft, signal)).toEqual([]);
  expect(read).not.toHaveBeenCalled();
  expect(draft.parts).toEqual([{ type: 'text', text: 'The blue case costs 490 baht and is sold out.' }]);
});

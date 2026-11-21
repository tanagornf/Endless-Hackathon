import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterEach, expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import type { CatalogImage } from '@nless/shared/features/catalog/types';
import { model } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getCatalogItemDetails } from './service';

const bizA = SEED.businesses.find((entry) => entry.alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find((entry) => entry.alias === 'biz_demo_b')!.id;
const owner = SEED.users.find((entry) => entry.alias === 'owner_a')!;
const staff = SEED.users.find((entry) => entry.alias === 'staff_a')!;
const root = '/api/v1/businesses/' + bizA + '/catalog/items';
const header = ['X-Requested-With', 'nless'] as const;
const png = sharp({ create: { width: 4, height: 4, channels: 3, background: '#118844' } }).png().toBuffer();
afterEach(() => vi.restoreAllMocks());

async function fixture() {
  const agent = await createTestAgent();
  await loginAs(agent, owner.email);
  const result = await agent.post(root).set(...header).send({
    kind: 'product', sku: 'PH-' + randomUUID(), name: 'รูปทดสอบ', nameEn: 'Catalog photo test', priceMinor: 14900, active: true,
  });
  expect(result.status).toBe(201);
  const itemId: string = result.body.data.id;
  const images = root + '/' + itemId + '/images';
  const bytes = await png;
  const upload = (alt: string) => agent.post(images).set(...header).field('alt', alt).attach('file', bytes, 'example.png');
  return { agent, itemId, images, upload, bytes };
}

it('attaches actual uploaded bytes, returns them to the authorized merchant and exposes file IDs to the chat', async () => {
  const { agent, itemId, upload, bytes } = await fixture();
  const created = await upload('กล่องเกม');
  expect(created.status).toBe(201);
  expect(created.body.data).toMatchObject({ version: 1, images: [{ alt: 'กล่องเกม', position: 0, flagged: false }] });
  const first: CatalogImage = created.body.data.images[0];
  const read = await agent.get(first.url);
  expect(read.status).toBe(200);
  expect(read.headers['content-type']).toMatch(/^image\/png/);
  expect(read.body).toEqual(bytes);
  expect((await getCatalogItemDetails(bizA, [itemId]))[0].images).toEqual([{ fileId: first.fileId, alt: 'กล่องเกม' }]);
  expect(await getCatalogItemDetails(bizB, [itemId])).toEqual([]);
});

it('retains a flagged image for merchant review but omits it from customer product details', async () => {
  const { itemId, upload } = await fixture();
  const moderate = vi.spyOn(model, 'moderate').mockResolvedValueOnce({ flagged: true, categories: ['test'], model: 'test', mode: 'fake', usageId: randomUUID() });
  const response = await upload('ตรวจสอบ');
  expect(response.status).toBe(201);
  expect(response.body.data.images[0].flagged).toBe(true);
  expect(moderate).toHaveBeenCalledWith({ usage: { featureId: 'F08', purpose: 'moderate', businessId: bizA }, images: [{ uploadRef: response.body.data.images[0].fileId }] });
  expect((await getCatalogItemDetails(bizA, [itemId]))[0].images).toEqual([]);
});

it('serializes concurrent image slots, rejects invalid order and makes the next remaining photo primary', async () => {
  const { agent, images, upload, itemId } = await fixture();
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => upload('photo ' + index)));
  expect(results.filter((response) => response.status === 201)).toHaveLength(5);
  expect(results.find((response) => response.status === 400)?.body.error.details).toEqual({ reason: 'image_limit' });
  const found: CatalogImage[] = (await agent.get(root + '/' + itemId)).body.data.images;
  expect(found.map((image) => image.position)).toEqual([0, 1, 2, 3, 4]);
  expect((await agent.put(images + '/order').set(...header).send({ imageIds: found.map(() => found[0].id) })).status).toBe(400);
  const reversed = found.map((image) => image.id).reverse();
  const ordered = await agent.put(images + '/order').set(...header).send({ imageIds: reversed });
  expect(ordered.body.data.images.map((image: CatalogImage) => image.id)).toEqual(reversed);
  const removed = await agent.delete(images + '/' + reversed[0]).set(...header);
  expect(removed.body.data).toMatchObject({ version: 1 });
  expect(removed.body.data.images[0]).toMatchObject({ id: reversed[1], position: 0 });
  expect((await agent.get(found[4].url)).status).toBe(404);
});

it('validates media bytes and enforces product-write and shop/item scope on every association', async () => {
  const { agent, images, itemId, bytes, upload } = await fixture();
  expect((await agent.post(images).set(...header).attach('file', Buffer.from('not an image'), 'bad.png')).status).toBe(400);
  expect((await agent.post(images).set(...header).attach('file', bytes, { filename: 'bad.jpeg', contentType: 'image/jpeg' })).status).toBe(400);
  const viewer = await createTestAgent();
  await loginAs(viewer, staff.email);
  expect((await viewer.post(images).set(...header).attach('file', bytes, 'valid.png')).status).toBe(403);
  const own: CatalogImage = (await upload('own')).body.data.images[0];
  expect((await viewer.get(own.url)).status).toBe(200);
  expect((await viewer.delete(images + '/' + own.id).set(...header)).status).toBe(403);
  const foreignItem = SEED.catalog.find((item) => item.businessAlias === 'biz_demo_b')!;
  expect((await agent.get(own.url.replace(itemId, foreignItem.id))).status).toBe(404);
  expect((await agent.delete(images.replace(itemId, foreignItem.id) + '/' + own.id).set(...header)).status).toBe(404);
});

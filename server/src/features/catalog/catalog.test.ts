import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SEED, SEED_CHECKS } from '@nless/shared/core/fixtures';
import { db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import seed from './seed';
import { getCatalogItemDetails, getPrice, getProduct, listCatalogItems, parsePriceToMinor } from './service';
import { catalogKey } from './sku';

const bizA = SEED.businesses.find((entry) => entry.alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find((entry) => entry.alias === 'biz_demo_b')!.id;
const game = SEED.catalog.find((entry) => entry.alias === 'item_a_game')!;
const cards = SEED.catalog.find((entry) => entry.alias === 'item_a_card')!;
const kit = SEED.catalog.find((entry) => entry.alias === 'item_b_kit')!;
const staff = SEED.users.find((entry) => entry.alias === 'staff_a')!;

describe('F08 catalog price and product lookup', () => {
  it('quotes the exact seed prices, sold-out stock, and service availability', async () => {
    for (const check of SEED_CHECKS) {
      const businessId = SEED.businesses.find((entry) => entry.alias === check.business)!.id;
      const quote = await getPrice(businessId, { sku: check.sku, quantity: check.quantity });
      expect(quote.subtotalMinor).toBe(check.subtotalMinor);
      expect(Number.isInteger(quote.unitPriceMinor)).toBe(true);
    }
    expect(await getPrice(bizA, { sku: 'A-SOLD-01' })).toMatchObject({ available: 0, soldOut: true });
    expect(await getPrice(bizA, { sku: 'A-GAME-01', quantity: 6 })).toMatchObject({ available: 5, soldOut: true });
    expect(await getPrice(bizA, { sku: 'A-SERVICE-01' })).toMatchObject({ available: null, soldOut: false });
    expect(await getPrice(bizA, { sku: game.sku, variantId: game.variants[0].id }))
      .toMatchObject({ variantId: game.variants[0].id, unitPriceMinor: game.priceMinor, available: game.stock });
  });

  it('rejects noninteger and out-of-range quantities, unknown products, and unknown variants', async () => {
    for (const quantity of [0, -1, 1.5, '2' as unknown as number, NaN, 10_001]) {
      await expect(getPrice(bizA, { sku: game.sku, quantity })).rejects.toMatchObject({
        code: 'VALIDATION_ERROR', details: { field: 'quantity' },
      });
    }
    await expect(getPrice(bizA, { sku: kit.sku })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(getPrice(bizA, { sku: cards.sku, variantId: game.variants[0].id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('resolves bilingual names and normalizes SKU while rejecting ambiguous names and other shops', async () => {
    expect((await getProduct(bizA, { itemId: game.id }))?.id).toBe(game.id);
    for (const sku of ['a-game-01', ' A-GAME-01 ', 'Ａ-ＧＡＭＥ-０１']) {
      expect((await getProduct(bizA, { sku }))?.id).toBe(game.id);
    }
    for (const name of ['ชุดการ์ดตัวอย่าง Demo Cards', 'demo   cards card set']) {
      expect((await getProduct(bizA, { name }))?.id).toBe(cards.id);
    }
    expect((await getProduct(bizA, { name: 'Demo Quest' }))?.id).toBe(game.id);
    expect(await getProduct(bizA, { name: 'Demo' })).toBeNull();
    expect(await getProduct(bizA, { sku: kit.sku })).toBeNull();
    expect(await getProduct(bizA, { itemId: kit.id })).toBeNull();
  });
});

describe('F08 catalog queries', () => {
  it('matches all terms across names, SKU, and category, and applies stock and price filters', async () => {
    expect((await listCatalogItems(bizA, { query: 'quest เกมกระดาน Ａ-ＧＡＭＥ' })).items.map((item) => item.id)).toEqual([game.id]);
    expect((await listCatalogItems(bizA, { query: 'quest unknown' })).items).toEqual([]);
    expect((await listCatalogItems(bizA, { query: '%' })).items).toEqual([]);
    expect((await listCatalogItems(bizA, { category: 'การ์ด', maxPriceMinor: 9_900 })).items.map((item) => item.id)).toEqual([cards.id]);
    expect((await listCatalogItems(bizA, { category: 'การ์ด', maxPriceMinor: 9_899 })).items).toEqual([]);
    const inStock = (await listCatalogItems(bizA, { inStockOnly: true })).items.map((item) => item.sku);
    expect(inStock).toContain('A-SERVICE-01');
    expect(inStock).not.toContain('A-SOLD-01');
    expect(inStock).not.toContain('B-KIT-01');
  });

  it('uses variant SKUs and variant prices but omits inactive variants and items', async () => {
    const itemId = randomUUID();
    const variantId = randomUUID();
    const unavailableId = randomUUID();
    await db.tx(async (tx) => {
      await tx.query(
        "INSERT INTO catalog_items (id,business_id,sku,kind,name,price_minor,stock) VALUES ($1,$2,'T-ACCESSORY','product','Test Accessory',29000,7)",
        [itemId, bizA]);
      await tx.query(
        "INSERT INTO catalog_variants (id,business_id,item_id,name,name_key,sku,price_minor,active) " +
        "VALUES ($1,$2,$3,'Travel','travel','T-TRAVEL',18000,true),($4,$2,$3,'Hidden','hidden','T-HIDDEN',100,false)",
        [variantId, bizA, itemId, unavailableId]);
      await tx.query(
        'INSERT INTO catalog_sku_registry (business_id,sku_key,item_id,variant_id) VALUES ($1,$2,$3,$4),($1,$5,$3,$6)',
        [bizA, catalogKey('T-TRAVEL'), itemId, variantId, catalogKey('T-HIDDEN'), unavailableId]);
    });
    expect(await getPrice(bizA, { sku: 't-travel' })).toMatchObject({ itemId, variantId, unitPriceMinor: 18000, available: 7 });
    expect((await getProduct(bizA, { itemId }))?.variants.map((variant) => variant.id)).toEqual([variantId]);
    expect((await listCatalogItems(bizA, { query: 'test t-travel', maxPriceMinor: 18000 })).items.map((item) => item.id)).toEqual([itemId]);
    await expect(getPrice(bizA, { sku: 't-hidden' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await listCatalogItems(bizA, { query: 'T-HIDDEN' })).items).toEqual([]);
    await db.query('UPDATE catalog_items SET active=false WHERE business_id=$1 AND id=$2', [bizA, itemId]);
    expect(await getProduct(bizA, { itemId })).toBeNull();
    expect((await listCatalogItems(bizA, { query: 'Test Accessory' })).items).toEqual([]);
    expect(await getCatalogItemDetails(bizA, [itemId])).toEqual([]);
  });

  it('paginates without repeats and limits detail responses to ordered, tenant-owned active rows', async () => {
    const expected = (await listCatalogItems(bizA, { limit: 101 })).items.map((item) => item.id);
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listCatalogItems(bizA, { limit: 1, cursor });
      ids.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(ids).toEqual(expected);
    await expect(listCatalogItems(bizA, { limit: 0 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(listCatalogItems(bizA, { limit: 1.5 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(listCatalogItems(bizA, { cursor: 'garbage' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const details = await getCatalogItemDetails(bizA, [cards.id, kit.id, 'missing', game.id]);
    expect(details.map((item) => item.id)).toEqual([cards.id, game.id]);
    expect(details[1].variants[0]).toMatchObject({ effectivePriceMinor: game.priceMinor, effectiveStock: game.stock });
    await expect(getCatalogItemDetails(bizA, Array.from({ length: 101 }, () => game.id)))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('keeps seed rows idempotent and authorizes staff reads only for their business', async () => {
    const aliases = new Map([
      ...SEED.businesses, ...SEED.catalog, ...SEED.catalog.flatMap((entry) => entry.variants),
    ].map((entry) => [entry.alias, entry.id]));
    await seed.run({ db, fixtures: SEED, id: (alias) => aliases.get(alias)!, log: () => {} });
    const count = await db.one<{ value: number }>("SELECT count(*)::int AS value FROM catalog_items WHERE source='seed' AND business_id=ANY($1::uuid[])", [[bizA, bizB]]);
    expect(count.value).toBe(SEED.catalog.length);
    const history = await db.one<{ value: number }>(
      'SELECT count(*)::int AS value FROM catalog_price_history WHERE business_id=$1 AND item_id=$2 AND version=1', [bizA, game.id],
    );
    expect(history.value).toBe(1);
    const agent = await createTestAgent();
    await loginAs(agent, staff.email);
    const response = await agent.get('/api/v1/businesses/' + bizA + '/catalog/items');
    expect(response.status).toBe(200);
    expect(response.body.data.items).toContainEqual(expect.objectContaining({ nameEn: game.nameEn, priceMinor: game.priceMinor }));
    expect((await agent.get('/api/v1/businesses/' + bizB + '/catalog/items')).status).toBe(404);
  });
});

describe('F08 catalog money', () => {
  it.each([
    ['1,490', 149000], ['฿1,490.50', 149050], ['๑๔๙๐ บาท', 149000], ['12.5', 1250], ['0', 0],
    ['0.29', 29], ['1.15', 115], ['1.234', null], ['-5', null], ['1,49', null], ['', null],
    ['abc', null], ['100000000.01', null], [1490, 149000], [12.345, null],
  ])('parses %#', (input, expected) => {
    expect(parsePriceToMinor(input)).toBe(expected);
  });
});

import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { db } from '../../core';
import { createItem, getItemAdmin, getProduct, importCatalogItems, listCatalogItems } from './service';
import { CreateItemBody } from './schema';

const bizA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!.id;
const ownerA = SEED.users.find(({ alias }) => alias === 'owner_a')!.id;
const rowFor = (sku: string, rowNo = 1) => ({
  rowNo, sku, name: 'ชุดเกมสำหรับทดสอบ', nameEn: 'Test board game set', priceMinor: 149000, stock: 5,
});

it('validates without writing, and creates inactive drafts with tenant and source scope', async () => {
  const sku = 'IMPORT-DRAFT-' + randomUUID();
  const importId = randomUUID();
  const variantSku = sku + '-BLUE';
  const rows = [{ ...rowFor(sku), variants: [{ name: 'Blue', sku: variantSku, priceMinor: 159000 }] }];
  const input = { businessId: bizA, actorUserId: ownerA, importId, rows };
  expect(await importCatalogItems({ ...input, dryRun: true })).toEqual({
    applied: false, created: 1, updated: 0, skipped: 0, errors: [],
    items: [{ rowNo: 1, sku, itemId: null, action: 'created' }],
  });
  expect(await db.maybeOne('SELECT id FROM catalog_items WHERE business_id=$1 AND sku=$2', [bizA, sku])).toBeNull();
  expect(await db.maybeOne("SELECT id FROM audit_events WHERE business_id=$1 AND details->>'importId'=$2", [bizA, importId]))
    .toBeNull();
  const applied = await importCatalogItems(input);
  expect(applied).toMatchObject({ applied: true, created: 1, updated: 0, skipped: 0, errors: [] });
  const id = applied.items[0].itemId!;
  expect(await getItemAdmin(bizA, id)).toMatchObject({
    sku, active: false, source: 'import', sourceRef: importId, version: 1, priceMinor: 149000,
    variants: [expect.objectContaining({ name: 'Blue', sku: variantSku, effectivePriceMinor: 159000 })],
  });
  expect(await getProduct(bizA, { sku })).toBeNull();
  expect((await listCatalogItems(bizA, { query: sku })).items).toEqual([]);
  await expect(getItemAdmin(bizB, id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  const sameSkuOtherTenant = await importCatalogItems({ ...input, businessId: bizB, actorUserId: null });
  expect(sameSkuOtherTenant).toMatchObject({ applied: true, created: 1, errors: [] });
  expect(sameSkuOtherTenant.items[0].itemId).not.toBe(id);
  const replay = await importCatalogItems(input);
  expect(replay).toMatchObject({
    applied: false, created: 0, skipped: 1, errors: [{ code: 'sku_exists' }],
    items: [{ rowNo: 1, sku, itemId: id, action: 'skipped' }],
  });
}, 20_000);

it('aborts a mixed import or applies only valid rows and reports collisions and validation failures', async () => {
  const sku = 'IMPORT-SKIP-' + randomUUID();
  const existing = await createItem(bizA, { userId: ownerA }, CreateItemBody.parse({
    sku: sku + '-existing', kind: 'product', name: 'Existing product', priceMinor: 150,
    variants: [{ name: 'Small', sku: sku + '-variant' }],
  }));
  expect(existing.active).toBe(true);
  const input = {
    businessId: bizA, actorUserId: ownerA, importId: randomUUID(), rows: [
      rowFor(sku),
      rowFor(sku.toLowerCase(), 2),
      rowFor(sku + '-existing', 3),
      rowFor(sku + '-variant', 4),
      { ...rowFor(sku + '-bad-price', 5), priceMinor: -1 },
      { ...rowFor(sku + '-new-variant', 6), variants: [{ name: 'Small', sku: 'A-GAME-01' }] },
    ],
  };
  const aborted = await importCatalogItems(input);
  expect(aborted).toMatchObject({ applied: false, created: 1, skipped: 5 });
  expect(aborted.items[0].itemId).toBeNull();
  expect(aborted.errors.map(({ rowNo, code }) => [rowNo, code])).toEqual([
    [2, 'sku_duplicate_in_file'], [3, 'sku_exists'], [4, 'sku_taken'], [5, 'price_invalid'], [6, 'sku_taken'],
  ]);
  expect(await db.maybeOne('SELECT id FROM catalog_items WHERE business_id=$1 AND source_ref=$2', [bizA, input.importId])).toBeNull();
  const imported = await importCatalogItems({ ...input, onError: 'skip_row' });
  expect(imported).toMatchObject({ applied: true, created: 1, updated: 0, skipped: 5, errors: aborted.errors });
  expect(imported.items.map(({ action }) => action)).toEqual(['created', 'error', 'skipped', 'error', 'error', 'error']);
  expect(await getItemAdmin(bizA, imported.items[0].itemId!)).toMatchObject({ active: false });
  expect(await importCatalogItems({
    ...input, mode: 'update_existing', dryRun: true, rows: [rowFor(sku + '-variant')],
  })).toMatchObject({ applied: false, updated: 0, skipped: 1, errors: [{ code: 'sku_taken' }] });
}, 20_000);

it('updates an existing item without changing its identity, kind or publication', async () => {
  const sku = 'IMPORT-UPDATE-' + randomUUID();
  const item = await createItem(bizA, { userId: ownerA }, CreateItemBody.parse({
    sku, kind: 'product', name: 'Existing product', nameEn: 'Existing English name', priceMinor: 149000,
    description: 'Preserve this description', category: 'Original category', stock: 5, shippable: false,
    variants: [{ name: 'Small', sku: sku + '-small' }],
  }));
  const importId = randomUUID();
  const rows = [{ rowNo: 1, sku: sku.toLowerCase(), name: 'New name', priceMinor: 159000, stock: 7 }];
  const input = { businessId: bizA, actorUserId: ownerA, importId, rows, mode: 'update_existing' as const };
  expect(await importCatalogItems({ ...input, dryRun: true })).toMatchObject({
    applied: false, updated: 1, items: [{ action: 'updated', itemId: item.id }],
  });
  expect(await getItemAdmin(bizA, item.id)).toMatchObject({ version: 1, priceMinor: 149000, stock: 5 });
  expect(await importCatalogItems(input)).toMatchObject({ applied: true, updated: 1, errors: [] });
  expect(await getItemAdmin(bizA, item.id)).toMatchObject({
    sku, kind: 'product', active: true, source: 'manual', version: 2, stock: 7, priceMinor: 159000,
    name: 'New name', nameEn: 'Existing English name', description: 'Preserve this description',
    category: 'Original category', shippable: false, variants: [expect.objectContaining({ sku: sku + '-small' })],
  });
  await importCatalogItems(input);
  expect(await getItemAdmin(bizA, item.id)).toMatchObject({ version: 2, priceMinor: 159000, stock: 7 });
  const prices = await db.query('SELECT version,new_price_minor::int AS price FROM catalog_price_history WHERE business_id=$1 AND item_id=$2 ORDER BY version',
    [bizA, item.id]);
  expect(prices.rows).toEqual([{ version: 1, price: 149000 }, { version: 2, price: 159000 }]);
  const moves = await db.query('SELECT delta,stock_after FROM catalog_stock_moves WHERE business_id=$1 AND item_id=$2 AND reason=$3',
    [bizA, item.id, 'import']);
  expect(moves.rows).toEqual([{ delta: 2, stock_after: 7 }]);
  const events = await db.query('SELECT action FROM audit_events WHERE business_id=$1 AND target_id=$2 AND details->>\'importId\'=$3 ORDER BY action',
    [bizA, item.id, importId]);
  expect(events.rows).toEqual([{ action: 'catalog.item.update' }, { action: 'catalog.price.change' }]);
}, 20_000);

it('rolls back the drafts and their ledgers if the transaction cannot complete', async () => {
  const sku = 'IMPORT-ROLLBACK-' + randomUUID();
  const importId = randomUUID();
  const transaction = db.tx.bind(db);
  const failure = new Error('Synthetic failure after the catalog writes');
  const spy = vi.spyOn(db, 'tx').mockImplementationOnce((work) => transaction(async (tx) => {
    await work(tx);
    throw failure;
  }));
  try {
    await expect(importCatalogItems({
      businessId: bizA, actorUserId: ownerA, importId, rows: [rowFor(sku), rowFor(sku + '-other', 2)],
    })).rejects.toThrow(failure);
  } finally {
    spy.mockRestore();
  }
  expect(await db.maybeOne('SELECT id FROM catalog_items WHERE business_id=$1 AND source_ref=$2', [bizA, importId])).toBeNull();
  expect(await db.maybeOne('SELECT item_id FROM catalog_sku_registry WHERE business_id=$1 AND sku_key=$2', [bizA, sku.toLowerCase()]))
    .toBeNull();
  expect(await db.maybeOne("SELECT id FROM audit_events WHERE business_id=$1 AND details->>'importId'=$2", [bizA, importId]))
    .toBeNull();
}, 20_000);

it('requires service duration and keeps service drafts unshippable and untracked', async () => {
  const sku = 'IMPORT-SERVICE-' + randomUUID();
  const service = { rowNo: 1, sku, kind: 'service' as const, name: 'Test setup session', priceMinor: 9900 };
  const imported = await importCatalogItems({
    businessId: bizA, actorUserId: ownerA, importId: randomUUID(), onError: 'skip_row',
    rows: [
      { ...service, durationMinutes: 30 },
      { ...service, rowNo: 2, sku: sku + '-duration' },
      { ...service, rowNo: 3, sku: sku + '-stock', durationMinutes: 30, stock: 2 },
    ],
  });
  expect(imported).toMatchObject({
    applied: true, created: 1, skipped: 2, errors: [{ code: 'duration_required' }, { code: 'stock_invalid' }],
  });
  expect(await getItemAdmin(bizA, imported.items[0].itemId!)).toMatchObject({
    kind: 'service', active: false, durationMinutes: 30, stock: null, shippable: false,
  });
}, 20_000);

it('bounds import batches and serializes a concurrent manual SKU creation', async () => {
  const sku = 'IMPORT-RACE-' + randomUUID();
  const row = rowFor(sku);
  const input = { businessId: bizA, actorUserId: ownerA, importId: randomUUID() };
  await expect(importCatalogItems({ ...input, rows: [] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(importCatalogItems({ ...input, rows: Array(501).fill(row) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  const [manual, imported] = await Promise.allSettled([
    createItem(bizA, { userId: ownerA }, CreateItemBody.parse({ sku, kind: 'product', name: row.name, priceMinor: row.priceMinor })),
    importCatalogItems({ ...input, rows: [row, rowFor(sku + '-other', 2)], onError: 'skip_row' }),
  ]);
  expect(imported.status).toBe('fulfilled');
  if (imported.status !== 'fulfilled') throw imported.reason;
  if (manual.status === 'fulfilled') {
    expect(imported.value).toMatchObject({ created: 1, skipped: 1, errors: [{ code: 'sku_exists' }] });
  } else {
    expect(manual.reason).toMatchObject({ code: 'VALIDATION_ERROR', details: { code: 'sku_taken' } });
    expect(imported.value).toMatchObject({ created: 2, skipped: 0, errors: [] });
  }
  expect(await db.one('SELECT count(*)::int AS count FROM catalog_items WHERE business_id=$1 AND sku=$2', [bizA, sku]))
    .toEqual({ count: 1 });
}, 20_000);

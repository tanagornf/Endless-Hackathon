import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { db } from '../../core';
import type { DbExecutor } from '../../core';
import { CreateItemBody, PatchItemBody } from './schema';
import { adjustCatalogStock, createItem, deleteItem, getItemAdmin, getPrice, patchItem } from './service';

const bizA = SEED.businesses.find(({ alias }) => alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find(({ alias }) => alias === 'biz_demo_b')!.id;
const actor = { userId: SEED.users.find(({ alias }) => alias === 'owner_a')!.id };
type Adjustment = Parameters<typeof adjustCatalogStock>[0];

const createProduct = (fields: Record<string, unknown> = {}, businessId = bizA) => createItem(
  businessId, actor, CreateItemBody.parse({
    sku: 'STOCK-' + randomUUID(), kind: 'product', name: 'สินค้าทดสอบสต็อก', priceMinor: 149000, stock: 5, ...fields,
  }),
);
const order = (id: string, delta: number, variantId: string | null = null, refId = randomUUID()): Adjustment => ({
  businessId: bizA, itemId: id, variantId, delta, reason: 'order', refType: 'order', refId, actorUserId: null,
});
const cancel = (debit: Adjustment): Adjustment => ({
  ...debit, delta: -debit.delta, reason: 'order_cancel', refType: 'order_cancel', actorUserId: actor.userId,
});

it('applies concurrent debit and cancel replays once and preserves the original stock and version on replay', async () => {
  const item = await createProduct({ stock: 2 });
  const debit = order(item.id, -2);
  const charged = await Promise.all(Array.from({ length: 3 }, () => adjustCatalogStock(debit)));
  expect(charged.filter(({ applied }) => applied)).toHaveLength(1);
  expect(charged.map(({ stockAfter, version }) => [stockAfter, version])).toEqual([[0, 2], [0, 2], [0, 2]]);
  expect(await getPrice(bizA, { itemId: item.id })).toMatchObject({ available: 0, version: 2, soldOut: true });
  await patchItem(bizA, actor, item.id, PatchItemBody.parse({ expectedVersion: 2, stock: 1 }));
  expect(await adjustCatalogStock(debit)).toEqual({ stockAfter: 0, applied: false, version: 2 });
  const returned = await Promise.all(Array.from({ length: 3 }, () => adjustCatalogStock(cancel(debit))));
  expect(returned.filter(({ applied }) => applied)).toHaveLength(1);
  expect(returned.map(({ stockAfter, version }) => [stockAfter, version])).toEqual([[3, 4], [3, 4], [3, 4]]);
  expect(await getPrice(bizA, { itemId: item.id })).toMatchObject({ available: 3, version: 4 });
  const ledger = await db.query(
    'SELECT reason,delta,stock_after FROM catalog_stock_moves WHERE business_id=$1 AND item_id=$2 AND ref_id=$3 ORDER BY reason',
    [bizA, item.id, debit.refId],
  );
  expect(ledger.rows).toEqual([
    { reason: 'order', delta: -2, stock_after: 0 }, { reason: 'order_cancel', delta: 2, stock_after: 3 },
  ]);
  expect(await db.one("SELECT count(*)::int AS count FROM audit_events WHERE business_id=$1 AND target_id=$2 AND action='catalog.stock.adjust'",
    [bizA, item.id])).toEqual({ count: 2 });
}, 30_000);

it('rejects excess concurrent debits without leaving negative stock or partial ledger rows', async () => {
  const item = await createProduct();
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => adjustCatalogStock(order(item.id, -1))));
  expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(5);
  const failures = results.filter((result) => result.status === 'rejected');
  expect(failures.map(({ reason }) => reason.code)).toEqual(Array(5).fill('SOLD_OUT'));
  expect(await getPrice(bizA, { itemId: item.id })).toMatchObject({ available: 0, version: 6, soldOut: true });
  expect(await db.one('SELECT count(*)::int AS count FROM catalog_stock_moves WHERE business_id=$1 AND item_id=$2',
    [bizA, item.id])).toEqual({ count: 5 });
}, 30_000);

it('keeps untracked and historical adapter orders free of stock movements', async () => {
  const item = await createProduct({ stock: null });
  const untracked = order(item.id, -2);
  expect(await adjustCatalogStock(untracked)).toEqual({ stockAfter: null, applied: false, version: 1 });
  await patchItem(bizA, actor, item.id, PatchItemBody.parse({ expectedVersion: 1, stock: 5 }));
  expect(await adjustCatalogStock(untracked)).toEqual({ stockAfter: null, applied: false, version: 1 });
  expect(await adjustCatalogStock(cancel(untracked))).toEqual({ stockAfter: null, applied: false, version: 2 });

  const beforeCutover = order(item.id, -2);
  expect(await adjustCatalogStock(cancel(beforeCutover))).toEqual({ stockAfter: null, applied: false, version: 2 });
  expect(await adjustCatalogStock(beforeCutover)).toEqual({ stockAfter: null, applied: false, version: 2 });
  expect(await adjustCatalogStock(cancel(beforeCutover))).toEqual({ stockAfter: null, applied: false, version: 2 });
  expect(await getPrice(bizA, { itemId: item.id })).toMatchObject({ available: 5, version: 2 });
  expect(await db.one('SELECT count(*)::int AS count FROM catalog_stock_moves WHERE business_id=$1 AND item_id=$2 AND ref_id IS NOT NULL',
    [bizA, item.id])).toEqual({ count: 0 });
}, 20_000);

it('returns stock to the original parent or tracked variant bucket after tracking changes', async () => {
  const item = await createProduct({
    stock: 8, variants: [{ name: 'Shared stock', stock: null }, { name: 'Tracked stock', stock: 3 }],
  });
  const [shared, tracked] = item.variants;
  const parentDebit = order(item.id, -3, shared.id);
  expect(await adjustCatalogStock(parentDebit)).toEqual({ stockAfter: 5, applied: true, version: 2 });
  await db.query('UPDATE catalog_variants SET stock=4 WHERE business_id=$1 AND item_id=$2 AND id=$3',
    [bizA, item.id, shared.id]);
  expect(await adjustCatalogStock(cancel(parentDebit))).toEqual({ stockAfter: 8, applied: true, version: 3 });
  expect(await getPrice(bizA, { itemId: item.id, variantId: shared.id })).toMatchObject({ available: 4 });

  const variantDebit = order(item.id, -2, tracked.id);
  expect(await adjustCatalogStock(variantDebit)).toEqual({ stockAfter: 1, applied: true, version: 4 });
  expect(await adjustCatalogStock(cancel(variantDebit))).toEqual({ stockAfter: 3, applied: true, version: 5 });

  const removedBucketDebit = order(item.id, -2, tracked.id);
  expect(await adjustCatalogStock(removedBucketDebit)).toEqual({ stockAfter: 1, applied: true, version: 6 });
  await db.query('DELETE FROM catalog_variants WHERE business_id=$1 AND item_id=$2 AND id=$3', [bizA, item.id, tracked.id]);
  expect(await adjustCatalogStock(cancel(removedBucketDebit))).toEqual({ stockAfter: null, applied: false, version: 6 });
  expect(await getItemAdmin(bizA, item.id)).toMatchObject({ stock: 8, variants: [expect.objectContaining({ stock: 4 })] });
}, 25_000);

it('returns an actual debit to an inactive item and rejects cross-tenant or mismatched amounts', async () => {
  const item = await createProduct();
  const foreign = await createProduct({ variants: [{ name: 'Foreign bucket', stock: 3 }] }, bizB);
  const debit = order(item.id, -2);
  await expect(adjustCatalogStock({ ...debit, businessId: bizB })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  await expect(adjustCatalogStock({ ...debit, variantId: foreign.variants[0].id })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await adjustCatalogStock(debit)).toEqual({ stockAfter: 3, applied: true, version: 2 });
  await patchItem(bizA, actor, item.id, PatchItemBody.parse({ expectedVersion: 2, active: false }));
  await expect(adjustCatalogStock({ ...cancel(debit), delta: 3 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(await adjustCatalogStock(cancel(debit))).toEqual({ stockAfter: 5, applied: true, version: 4 });
  expect(await getItemAdmin(bizA, item.id)).toMatchObject({ active: false, stock: 5 });
  const beforeDelete = order(item.id, -2);
  expect(await adjustCatalogStock(beforeDelete)).toEqual({ stockAfter: 3, applied: true, version: 5 });
  await deleteItem(bizA, actor, item.id);
  expect(await adjustCatalogStock(cancel(beforeDelete))).toEqual({ stockAfter: 5, applied: true, version: 7 });
  await expect(adjustCatalogStock(order(item.id, -1))).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(await getItemAdmin(bizB, foreign.id)).toMatchObject({ stock: 5, version: 1 });
}, 25_000);

it('rolls back stock, version and ledger when transaction audit fails', async () => {
  const item = await createProduct();
  const debit = order(item.id, -2);
  const transaction = db.tx.bind(db);
  const failure = new Error('Synthetic stock audit write failure');
  const spy = vi.spyOn(db, 'tx').mockImplementationOnce((work) => transaction(async (tx) => {
    const query: DbExecutor['query'] = async <T>(sql: string, params?: readonly unknown[]) => {
      if (/\bINSERT\s+INTO\s+audit_events\b/i.test(sql)) throw failure;
      return tx.query<T>(sql, params);
    };
    return work({ ...tx, query });
  }));
  try {
    await expect(adjustCatalogStock(debit)).rejects.toThrow(failure);
  } finally {
    spy.mockRestore();
  }
  expect(await getPrice(bizA, { itemId: item.id })).toMatchObject({ available: 5, version: 1 });
  expect(await db.maybeOne('SELECT id FROM catalog_stock_moves WHERE business_id=$1 AND item_id=$2 AND ref_id=$3',
    [bizA, item.id, debit.refId])).toBeNull();
  expect(await adjustCatalogStock(debit)).toEqual({ stockAfter: 3, applied: true, version: 2 });
}, 20_000);

import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { db } from '../../core';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getPrice, getProduct } from './service';

const bizA = SEED.businesses.find((entry) => entry.alias === 'biz_demo_a')!.id;
const bizB = SEED.businesses.find((entry) => entry.alias === 'biz_demo_b')!.id;
const owner = SEED.users.find((entry) => entry.alias === 'owner_a')!;
const staff = SEED.users.find((entry) => entry.alias === 'staff_a')!;
const path = '/api/v1/businesses/' + bizA + '/catalog/items';
const header = ['X-Requested-With', 'nless'] as const;
const makeInput = (sku: string) => ({
  sku, kind: 'product', name: 'เกมทดสอบ', nameEn: 'Test board game', priceMinor: 149000, stock: 5,
});

it('creates and updates canonical prices with one version bump and persists price history', async () => {
  const ownerAgent = await createTestAgent();
  await loginAs(ownerAgent, owner.email);
  const sku = 'TEST-EDIT-' + randomUUID();
  const create = await ownerAgent.post(path).set(...header).send(makeInput(sku));
  expect(create.status).toBe(201);
  const id = String(create.body.data.id);
  const item = path + '/' + id;
  expect(create.body.data).toMatchObject({ sku, version: 1, priceMinor: 149000, stock: 5, nameEn: 'Test board game' });
  const initial = await getPrice(bizA, { sku, quantity: 2 });
  expect(initial).toMatchObject({ subtotalMinor: 298000, version: 1 });
  const edited = await ownerAgent.patch(item).set(...header).send({ expectedVersion: 1, priceMinor: 159000 });
  expect(edited.status).toBe(200);
  expect(edited.body.data).toMatchObject({ priceMinor: 159000, version: 2 });
  expect(await getPrice(bizA, { sku, quantity: 2 })).toMatchObject({ subtotalMinor: 318000, version: 2 });
  const read = await ownerAgent.get(item);
  expect(read.body.data).toMatchObject({ priceMinor: 159000, version: 2 });
  const conflict = await ownerAgent.patch(item).set(...header).send({ expectedVersion: 1, name: 'Stale' });
  expect(conflict.status).toBe(409);
  expect(conflict.body.error.details.currentVersion).toBe(2);
  const history = await db.query<{ version: number; price: number }>(
    'SELECT version,new_price_minor::int AS price FROM catalog_price_history WHERE business_id=$1 AND item_id=$2 ORDER BY version', [bizA, id],
  );
  expect(history.rows).toEqual([{ version: 1, price: 149000 }, { version: 2, price: 159000 }]);
  const metadata = await ownerAgent.patch(item).set(...header).send({ expectedVersion: 2, category: 'เกมทดสอบ', description: 'Test category' });
  expect(metadata.body.data).toMatchObject({ version: 2, category: 'เกมทดสอบ' });
  const unchanged = await ownerAgent.patch(item).set(...header).send({ expectedVersion: 2, priceMinor: 159000 });
  expect(unchanged.body.data.version).toBe(2);
}, 20_000);

it('accepts only one competing price write and hides items turned off', async () => {
  const ownerAgent = await createTestAgent();
  await loginAs(ownerAgent, owner.email);
  const sku = 'TEST-RACE-' + randomUUID();
  const created = await ownerAgent.post(path).set(...header).send(makeInput(sku));
  expect(created.status).toBe(201);
  const item = path + '/' + created.body.data.id;
  const results = await Promise.all([149100, 149200].map((priceMinor) =>
    ownerAgent.patch(item).set(...header).send({ expectedVersion: 1, priceMinor })));
  expect(results.map((response) => response.status).sort()).toEqual([200, 409]);
  const winner = results.find((response) => response.status === 200)!;
  expect(await getPrice(bizA, { sku })).toMatchObject({ version: 2, unitPriceMinor: winner.body.data.priceMinor });
  const disabled = await ownerAgent.patch(item).set(...header).send({ expectedVersion: 2, active: false });
  expect(disabled.body.data).toMatchObject({ active: false, version: 3 });
  expect(await getProduct(bizA, { sku })).toBeNull();
  expect((await ownerAgent.get(item)).body.data.active).toBe(false);
}, 20_000);

it('protects creates and edits with product.write, tenant scope, strict prices and SKU uniqueness', async () => {
  const ownerAgent = await createTestAgent();
  const staffAgent = await createTestAgent();
  await loginAs(ownerAgent, owner.email);
  await loginAs(staffAgent, staff.email);
  const input = makeInput('TEST-SKU-' + randomUUID());
  const created = await ownerAgent.post(path).set(...header).send(input);
  const item = path + '/' + created.body.data.id;
  expect((await staffAgent.get(item)).status).toBe(200);
  expect((await staffAgent.post(path).set(...header).send(input)).status).toBe(403);
  expect((await staffAgent.patch(item).set(...header).send({ expectedVersion: 1, priceMinor: 100 })).status).toBe(403);
  const itemB = SEED.catalog.find((entry) => entry.businessAlias === 'biz_demo_b')!;
  expect((await ownerAgent.patch(path + '/' + itemB.id).set(...header).send({ expectedVersion: 1, priceMinor: 100 })).status).toBe(404);
  expect((await ownerAgent.post('/api/v1/businesses/' + bizB + '/catalog/items').set(...header).send(input)).status).toBe(404);
  for (const invalid of [-1, 1.5, 10_000_000_001]) {
    expect((await ownerAgent.post(path).set(...header).send({ ...input, priceMinor: invalid })).status).toBe(400);
    expect((await ownerAgent.patch(item).set(...header).send({ expectedVersion: 1, priceMinor: invalid })).status).toBe(400);
  }
  const duplicate = await ownerAgent.post(path).set(...header).send({ ...input, sku: input.sku.toLowerCase() });
  expect(duplicate.status).toBe(400);
  expect(duplicate.body.error.details).toMatchObject({ code: 'sku_taken', itemId: created.body.data.id });
  expect((await ownerAgent.patch(item).set(...header).send({ expectedVersion: 1, kind: 'service' })).status).toBe(400);
}, 20_000);

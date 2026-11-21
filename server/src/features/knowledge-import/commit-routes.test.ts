import { SEED } from '@nless/shared/core/fixtures';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestAgent, drainJobs, loginAs } from '../../core/test-utils';
import { listItems } from '../catalog/service';
import { getKnowledgeItem } from '../knowledge/service';
import { IMPORT_JOB } from './config';

const demoA = SEED.businesses.find(shop => shop.alias === 'biz_demo_a')!;
const demoB = SEED.businesses.find(shop => shop.alias === 'biz_demo_b')!;
const imports = (id = demoA.id) => '/api/v1/businesses/' + id + '/imports';
const headers = { 'X-Requested-With': 'nless' };
const mapping = { target: 'catalog', mapping: { catalog: { sku: 0, name: 1, price: 2 } } };
let owner: Awaited<ReturnType<typeof createTestAgent>>;
let unrelated: Awaited<ReturnType<typeof createTestAgent>>;

beforeAll(async () => {
  [owner, unrelated] = await Promise.all([createTestAgent(), createTestAgent()]);
  await Promise.all([loginAs(owner, 'owner.a@example.test'), loginAs(unrelated, 'owner.b@example.test')]);
}, 20_000);

async function drain() {
  expect((await drainJobs({ type: IMPORT_JOB, maxMs: 15_000 })).dead).toBe(0);
}

async function stageCsv(name: string, content: string, update = false): Promise<string> {
  const upload = await owner.post(imports() + '/file').set(headers).attach('file', Buffer.from(content), { filename: name, contentType: 'text/csv' });
  expect(upload.status, JSON.stringify(upload.body)).toBe(202);
  const id = upload.body.data.id as string;
  await drain();
  const mapped = await owner.post(imports() + '/' + id + '/mapping').set(headers).send({ ...mapping, options: { catalogMode: update ? 'update_existing' : 'create_only' } });
  expect(mapped.status, JSON.stringify(mapped.body)).toBe(202);
  await drain();
  return id;
}

describe('F06 draft commit and error export', { timeout: 40_000 }, () => {
  it('saves catalog items as inactive drafts once and exports formula-safe error lines', async () => {
    const id = await stageCsv('e2e-f06-commit.csv', 'SKU,Name,Price\nF06-DRAFT-SKU,Demo draft,1490\nF06-FORMULA,=1+1,not a price');
    const path = imports() + '/' + id;
    const submit = () => owner.post(path + '/commit').set(headers).send({});
    const responses = await Promise.all([submit(), submit()]);
    expect(responses.map(item => item.status).sort()).toEqual([202, 422]);
    await drain();
    expect((await owner.get(path)).body.data).toMatchObject({ state: 'done', counts: { written: 1, error: 1 } });
    const catalog = await listItems(demoA.id, { q: 'F06-DRAFT-SKU', status: 'all', limit: 10 });
    expect(catalog.items).toMatchObject([{ sku: 'F06-DRAFT-SKU', priceMinor: 149000, active: false }]);
    const file = await owner.get(path + '/errors.csv');
    expect(file.status).toBe(200);
    expect(file.headers['content-disposition']).toContain('errors.csv');
    expect(file.text.charCodeAt(0)).toBe(0xfeff);
    expect(file.text).toContain(String.fromCharCode(34, 39) + '=1+1' + String.fromCharCode(34));
    expect((await unrelated.get(imports(demoB.id) + '/' + id + '/errors.csv')).status).toBe(404);
  });

  it('updates the selected price without clearing unmapped fields', async () => {
    const created = await owner.post('/api/v1/businesses/' + demoA.id + '/catalog/items').set(headers).send({
      sku: 'F06-PRESERVE-SKU', kind: 'product', name: 'Existing demo', nameEn: 'Existing English name',
      description: 'Existing product description', category: 'Existing category', priceMinor: 9000, stock: 8, active: true,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = await stageCsv('e2e-f06-reprice.csv', 'SKU,Name,Price\nF06-PRESERVE-SKU,Existing demo,109', true);
    const path = imports() + '/' + id;
    expect((await owner.post(path + '/commit').set(headers).send({})).status).toBe(202);
    await drain();
    expect((await owner.get(path)).body.data).toMatchObject({ state: 'done', counts: { updated: 1 } });
    const item = await owner.get('/api/v1/businesses/' + demoA.id + '/catalog/items/' + created.body.data.id);
    expect(item.body.data).toMatchObject({ priceMinor: 10900, nameEn: 'Existing English name',
      description: 'Existing product description', category: 'Existing category', stock: 8, active: true });
  });

  it('writes an edited article through the real knowledge draft contract and confirms identical sources', async () => {
    const body = {
      label: 'e2e-f06-articles',
      text: '# F06 source fixture\nStore opens from 10:00 to 20:00 every day. The shop offers two board games.',
      options: { mode: 'as_article', folderName: 'F06 import tests' },
    };
    const upload = () => owner.post(imports() + '/text').set(headers).send(body);
    const started = await upload();
    expect(started.status, JSON.stringify(started.body)).toBe(202);
    const id = started.body.data.id;
    await drain();
    const path = imports() + '/' + id;
    expect((await owner.get(path)).body.data).toMatchObject({ target: 'article', state: 'review', counts: { ready: 1 } });
    const row = (await owner.get(path + '/rows')).body.data.items[0];
    const update = await owner.patch(path + '/rows/' + row.id).set(headers).send({ title: 'F06 revised draft' });
    expect(update.status, JSON.stringify(update.body)).toBe(200);
    expect(update.body.data.data.title).toBe('F06 revised draft');
    expect((await unrelated.patch(imports(demoB.id) + '/' + id + '/rows/' + row.id).set(headers).send({ excluded: true })).status).toBe(404);
    expect((await owner.post(path + '/commit').set(headers).send({})).status).toBe(202);
    await drain();
    const finished = (await owner.get(path + '/rows')).body.data.items[0];
    expect(finished.status).toBe('written');
    expect(await getKnowledgeItem(demoA.id, finished.createdRef)).toMatchObject({ status: 'draft', title: 'F06 revised draft' });
    expect(await getKnowledgeItem(demoB.id, finished.createdRef)).toBeNull();

    const duplicate = await upload();
    expect(duplicate.body.data.duplicate).toMatchObject({ importId: id, version: 1 });
    await drain();
    const duplicatePath = imports() + '/' + duplicate.body.data.id;
    const blocked = await owner.post(duplicatePath + '/commit').set(headers).send({});
    expect(blocked.body.error).toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'already_imported' } });
    expect((await owner.post(duplicatePath + '/commit').set(headers).send({ allowReimport: true })).status).toBe(202);
    await drain();
  });

  it('rehearses a 20-row timing sheet and restores the seed price-equivalent and all synthetic drafts', async () => {
    const catalogPath = '/api/v1/businesses/' + demoA.id + '/catalog/items';
    const sku = 'F06-TIMING-BASE';
    const draftPrefix = 'F06-TIMING-DRAFT';
    const created = await owner.post(catalogPath).set(headers).send({
      kind: 'product', sku, name: 'Timing baseline', priceMinor: 9900, stock: 9, active: true,
    });
    expect(created.status).toBe(201);
    const baselinePath = catalogPath + '/' + created.body.data.id;
    const makeSheet = (price: number, drafts: string[] = []) =>
      ['SKU,Name,Price', sku + ',Timing baseline,' + price, ...drafts].join('\n');
    const draftRows = Array.from({ length: 19 }, (_, index) => draftPrefix + '-' + index + ',Timing draft,' + (20 + index));
    try {
      const id = await stageCsv('e2e-f06-timing-batch.csv', makeSheet(109, draftRows), true);
      const path = imports() + '/' + id;
      expect((await owner.post(path + '/commit').set(headers).send({})).status).toBe(202);
      await drain();
      const done = (await owner.get(path)).body.data;
      expect(done).toMatchObject({ state: 'done', counts: { written: 19, updated: 1, total: 20, error: 0 } });
      expect(Date.parse(done.timings.readyAt)).toBeGreaterThanOrEqual(Date.parse(done.timings.uploadedAt));
      expect(Date.parse(done.timings.committedAt)).toBeGreaterThanOrEqual(Date.parse(done.timings.commitStartedAt));
      expect((await owner.get(baselinePath)).body.data).toMatchObject({ priceMinor: 10900, stock: 9, active: true });
    } finally {
      try {
        const restore = await stageCsv('e2e-f06-timing-restore.csv', makeSheet(99), true);
        expect((await owner.post(imports() + '/' + restore + '/commit').set(headers).send({})).status).toBe(202);
        await drain();
        expect((await owner.get(baselinePath)).body.data).toMatchObject({ priceMinor: 9900, stock: 9, active: true });
      } finally {
        const leftovers = await listItems(demoA.id, { q: draftPrefix, status: 'all', limit: 100 });
        for (const row of leftovers.items) {
          expect(row.active).toBe(false);
          expect((await owner.delete(catalogPath + '/' + row.id).set(headers)).ok).toBe(true);
        }
        expect((await listItems(demoA.id, { q: draftPrefix, status: 'all', limit: 100 })).items).toHaveLength(0);
      }
    }
  }, 45_000);

  it('stages a Thai text file with the same retained article flow', async () => {
    const response = await owner.post(imports() + '/file').set(headers).field('options', JSON.stringify({ mode: 'as_article' }))
      .attach('file', Buffer.from('# เวลาเปิดร้าน\nร้านเปิดทุกวันตั้งแต่ 10:00 ถึง 20:00 น.'), { filename: 'e2e-f06-th.txt', contentType: 'text/plain' });
    expect(response.status, JSON.stringify(response.body)).toBe(202);
    await drain();
    const path = imports() + '/' + response.body.data.id;
    expect((await owner.get(path)).body.data).toMatchObject({ kind: 'text', target: 'article', state: 'review', counts: { ready: 1 } });
    expect((await owner.get(path + '/rows')).body.data.items).toMatchObject([{ status: 'ready', data: { title: 'เวลาเปิดร้าน' } }]);
  });
});

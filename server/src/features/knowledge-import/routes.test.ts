import { SEED } from '@nless/shared/core/fixtures';
import type { ImportView } from '@nless/shared/features/knowledge-import/types';
import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../../core';
import { createTestAgent, drainJobs, loginAs } from '../../core/test-utils';
import { listItems } from '../catalog/service';
import { IMPORT_JOB } from './config';

const shop = (alias: string) => SEED.businesses.find(item => item.alias === alias)!;
const demoA = shop('biz_demo_a');
const demoB = shop('biz_demo_b');
const imports = (businessId = demoA.id) => '/api/v1/businesses/' + businessId + '/imports';
const mapping = { target: 'catalog', mapping: { catalog: { sku: 0, name: 1, price: 2 } } };
type Agent = Awaited<ReturnType<typeof createTestAgent>>;
let ownerA: Agent;
let ownerB: Agent;
let staffA: Agent;

beforeAll(async () => {
  [ownerA, ownerB, staffA] = await Promise.all([createTestAgent(), createTestAgent(), createTestAgent()]);
  await Promise.all([loginAs(ownerA, 'owner.a@example.test'), loginAs(ownerB, 'owner.b@example.test'), loginAs(staffA, 'staff.a@example.test')]);
}, 30_000);

function upload(agent: Agent, text: string | Buffer, name: string) {
  return agent.post(imports() + '/file').set('X-Requested-With', 'nless')
    .attach('file', Buffer.from(text), { filename: name, contentType: 'application/octet-stream' });
}
async function drain() {
  expect((await drainJobs({ type: IMPORT_JOB, maxMs: 12_000 })).dead).toBe(0);
}
async function uploadParsed(file: string, name: string): Promise<ImportView> {
  const created = await upload(ownerA, file, name);
  expect(created.status, JSON.stringify(created.body)).toBe(202);
  await drain();
  const response = await ownerA.get(imports() + '/' + created.body.data.id);
  expect(response.status).toBe(200);
  expect(response.body.data.state).toBe('awaiting_mapping');
  return response.body.data;
}
const sample = 'SKU,Product Name,Price (THB)\nF06-LANE-ONE,Golden cards,199\nF06-LANE-BAD,Bad row,invalid\nF06-LANE-TWO,Line tiles,50.5';

describe('F06 CSV upload and preview', { timeout: 30_000 }, () => {
  it('uploads English CSV, evaluates rows with the real catalog dry-run, and does not create catalog items', async () => {
    const parsed = await uploadParsed(sample, 'e2e-import-en.csv');
    expect(parsed).toMatchObject({ version: 1, counts: { total: 3 }, detected: { target: 'catalog', mapping: mapping.mapping } });
    const preview = await ownerA.get(imports() + '/' + parsed.id + '/rows?limit=2');
    expect(preview.body.data.items).toMatchObject([{ rowNo: 2, status: 'pending' }, { rowNo: 3, status: 'pending' }]);
    expect(preview.body.data.nextCursor).toBeTruthy();

    const queued = await ownerA.post(imports() + '/' + parsed.id + '/mapping').set('X-Requested-With', 'nless').send(mapping);
    expect(queued.status, JSON.stringify(queued.body)).toBe(202);
    await drain();
    const review = await ownerA.get(imports() + '/' + parsed.id);
    expect(review.body.data).toMatchObject({ state: 'review', counts: { total: 3, ready: 2, error: 1 } });
    const rows = await ownerA.get(imports() + '/' + parsed.id + '/rows?status=error');
    expect(rows.body.data.items).toMatchObject([{ rowNo: 3, error: { code: 'price_invalid', column: 'Price (THB)' } }]);
    const catalog = await listItems(demoA.id, { q: 'F06-LANE-ONE', status: 'all', limit: 10 });
    expect(catalog.items).toHaveLength(0);
    const events = await db.query<{ action: string }>('SELECT action FROM audit_events WHERE business_id=$1 AND target_id=$2 ORDER BY created_at',
      [demoA.id, parsed.id]);
    expect(events.rows.map(event => event.action)).toEqual(['knowledge-import.create', 'knowledge-import.mapping']);
  });

  it('detects Thai FAQ columns and prevents access from the other business', async () => {
    const parsed = await uploadParsed('คำถาม,คำตอบ\nร้านเปิดเวลาไหน,เปิดเวลา 10:00 น.', 'e2e-import-th.csv');
    expect(parsed.detected).toMatchObject({ target: 'faq', mapping: { faq: { question: 0, answer: 1 } } });
    const path = imports(demoB.id) + '/' + parsed.id;
    expect((await ownerB.get(path)).status).toBe(404);
    expect((await ownerB.get(path + '/rows')).status).toBe(404);
    expect((await ownerB.post(path + '/mapping').set('X-Requested-With', 'nless').send(mapping)).status).toBe(404);
    expect((await staffA.get(imports() + '/' + parsed.id)).status).toBe(200);
    expect((await staffA.post(imports() + '/' + parsed.id + '/cancel').set('X-Requested-With', 'nless')).status).toBe(403);
  });

  it('reports the real existing price and leaves it unchanged after an update preview', async () => {
    const parsed = await uploadParsed('SKU,Name,Price\nA-CARD-01,Demo Cards set,109', 'e2e-import-existing.csv');
    const patch = await ownerA.post(imports() + '/' + parsed.id + '/mapping').set('X-Requested-With', 'nless')
      .send({ ...mapping, options: { catalogMode: 'update_existing' } });
    expect(patch.status, JSON.stringify(patch.body)).toBe(202);
    await drain();
    const rows = await ownerA.get(imports() + '/' + parsed.id + '/rows');
    expect(rows.body.data.items).toMatchObject([{ status: 'ready', data: { priceMinor: 10900, existing: { priceMinor: 9900 } },
      warnings: [{ code: 'price_will_change' }] }]);
    const catalog = await listItems(demoA.id, { q: 'A-CARD-01', status: 'all', limit: 10 });
    expect(catalog.items.find(item => item.sku === 'A-CARD-01')?.priceMinor).toBe(9900);
  });

  it('rejects disallowed uploads, reports completed-source versions and enforces cancel state', async () => {
    expect((await upload(staffA, sample, 'e2e-readonly.csv')).status).toBe(403);
    expect((await upload(ownerA, sample, 'e2e-invalid.docx')).body.error).toMatchObject({ code: 'VALIDATION_ERROR', details: { reason: 'file_type' } });
    expect((await upload(ownerA, Buffer.from([0, 1, 2]), 'e2e-binary.csv')).body.error).toMatchObject({ details: { reason: 'file_type' } });
    const first = await uploadParsed(sample, 'e2e-duplicate.csv');
    await db.query('UPDATE knowledge_source_versions SET complete=true WHERE business_id=$1 AND import_id=$2', [demoA.id, first.id]);
    const second = await uploadParsed(sample, 'e2e-duplicate.csv');
    expect(second).toMatchObject({ version: 2, duplicate: { importId: first.id, version: 1 } });
    const path = imports() + '/' + second.id;
    const stop = await ownerA.post(path + '/cancel').set('X-Requested-With', 'nless');
    expect(stop.body.data.state).toBe('cancelled');
    const late = await ownerA.post(path + '/mapping').set('X-Requested-With', 'nless').send(mapping);
    expect(late.body.error).toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'wrong_state' } });
  });
});

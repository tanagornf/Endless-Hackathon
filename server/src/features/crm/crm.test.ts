import { afterAll, expect, test, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { getCustomer, listCustomersByTags, listTags, setMarketingConsent, addInferredTag } from './service';
import { assignTag, createTag, deleteTag, unassignTag } from './mutations';

const a = seedId('biz_demo_a'), b = seedId('biz_demo_b'), one = seedId('cust_a1'), two = seedId('cust_a2');
const vip = seedId('tag_vip_a'), foreign = seedId('tag_vip_b');
const owner = { businessId: a, actorUserId: seedId('owner_a') };
const makeTag = (name: string) => createTag(owner, { name, color: 'amber', description: '' });
const prefix = '/api/v1/businesses/' + a + '/crm';
vi.setConfig({ testTimeout: 45000 });
afterAll(closeDb);

test('contracts preserve identity shape, tenant, granted audience, cursor and eval exclusion', async () => {
  expect(await getCustomer(b, one)).toBeNull();
  expect(await getCustomer(a, randomUUID())).toBeNull();
  expect(await getCustomer(a, one)).toMatchObject({ displayName: 'A Customer One', marketingConsent: 'granted', tags: [{ id: vip, name: 'VIP', source: 'manual' }] });
  expect((await getCustomer(a, two))?.marketingConsent).toBe('revoked');
  const evalId = randomUUID();
  await db.query(`INSERT INTO customers(id,business_id,channel,external_id,display_name) VALUES($1,$2,'web',$3,'Test visitor')`, [evalId, a, 'eval-' + evalId]);
  try {
    await assignTag(owner, evalId, { tagId: vip });
    const page = await listCustomersByTags(a, [vip, foreign], { limit: 1 });
    expect(page.items).toHaveLength(1);
    expect(Object.keys(page.items[0]).sort()).toEqual(['id', 'businessId', 'displayName', 'channel', 'externalId', 'tagIds', 'marketingConsent', 'lastSeenAt'].sort());
    const next = await listCustomersByTags(a, [vip], { cursor: page.nextCursor, limit: 1 });
    expect([...page.items, ...next.items].map(i => i.id).sort()).toEqual([one, two].sort());
    expect(next.nextCursor).toBeNull();
    expect((await listCustomersByTags(a, [vip], { requireConsent: 'granted' })).items.map(i => i.id)).toEqual([one]);
    expect((await listCustomersByTags(a, [foreign])).items).toEqual([]);
    expect((await listCustomersByTags(a, [])).items).toEqual([]);
    await expect(listCustomersByTags(a, [vip], { limit: 0 })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await listTags(a)).toContainEqual({ id: vip, name: 'VIP', customerCount: 2 });
    expect(await listTags(b)).toContainEqual({ id: foreign, name: 'VIP', customerCount: 1 });
  } finally { await db.query('DELETE FROM customers WHERE business_id=$1 AND id=$2', [a, evalId]); }
});

test('tag creation, priority, suppression, invalid lengths and versioned dependencies', async () => {
  const key = randomUUID().slice(0, 8);
  const tag = await makeTag('  VIP ' + key + ' ');
  try {
    await expect(makeTag('vip  ' + key)).rejects.toMatchObject({ code: 'POLICY_BLOCKED', details: { reason: 'tag_exists' } });
    await expect(makeTag('x'.repeat(33))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const thai = await makeTag('ก้'.repeat(32));
    await deleteTag(owner, thai.id);
    expect(await addInferredTag({ businessId: a, customerId: one, tagId: tag.id, evidence: 'synthetic' })).toEqual({ added: true });
    await assignTag(owner, one, { tagId: tag.id });
    expect(await addInferredTag({ businessId: a, customerId: one, tagId: tag.id, evidence: 'synthetic' })).toEqual({ added: false });
    const rule = await db.one<{ id: string }>(`INSERT INTO crm_rules(business_id,name,kind,params,tag_id) VALUES($1,'test','new_customer_days','{}',$2) RETURNING id`, [a, tag.id]);
    try {
      await db.query(`UPDATE crm_customer_tags SET source='automation',rule_id=$3 WHERE business_id=$1 AND tag_id=$2 AND person_id=$4`, [a, tag.id, rule.id, one]);
      await expect(deleteTag(owner, tag.id)).rejects.toMatchObject({ details: { reason: 'tag_has_rules' } });
      await unassignTag(owner, one, tag.id);
      expect(await db.maybeOne('SELECT 1 FROM crm_tag_suppressions WHERE person_id=$1 AND tag_id=$2', [one, tag.id])).toBeTruthy();
      await assignTag(owner, one, { tagId: tag.id });
      expect(await db.maybeOne('SELECT 1 FROM crm_tag_suppressions WHERE person_id=$1 AND tag_id=$2', [one, tag.id])).toBeNull();
    } finally { await db.query('DELETE FROM crm_rules WHERE business_id=$1 AND id=$2', [a, rule.id]); }
  } finally { await deleteTag(owner, tag.id); }
});

test('parallel create-or-get returns one assignment and consent changes are idempotent', async () => {
  const name = 'parallel-' + randomUUID().slice(0, 8);
  await Promise.all([one, two].map(customerId => assignTag(owner, customerId, { name })));
  const tag = (await listTags(a)).find(t => t.name === name)!;
  try {
    expect(tag.customerCount).toBe(2);
    await expect(setMarketingConsent({ businessId: a, customerId: two, status: 'granted', source: 'system' })).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
    await expect(setMarketingConsent({ businessId: a, customerId: two, status: 'unknown', source: 'system' })).rejects.toMatchObject({ details: { reason: 'revoked_is_sticky' } });
    expect(await setMarketingConsent({ businessId: a, customerId: two, status: 'revoked', source: 'staff' })).toEqual({ status: 'revoked', changed: false });
  } finally { await deleteTag(owner, tag.id); }
});

test('routes enforce tenant and permission, list filters, masking, version and consent audit', async () => {
  const staff = await createTestAgent(), admin = await createTestAgent(), outsider = await createTestAgent();
  await Promise.all([loginAs(staff, 'staff.a@example.test'), loginAs(admin, 'owner.a@example.test'), loginAs(outsider, 'owner.b@example.test')]);
  const header = 'X-Requested-With';
  expect((await staff.post(prefix + '/tags').set(header, 'nless').send({ name: 'Forbidden' })).status).toBe(403);
  expect((await staff.post(prefix + '/customers/' + one + '/tags').set(header, 'nless').send({ name: 'Forbidden' })).status).toBe(403);
  expect((await staff.post(prefix + '/customers/' + one + '/tags').set(header, 'nless').send({ tagId: vip })).status).toBe(200);
  const badTag = await admin.post(prefix + '/customers/' + one + '/tags').set(header, 'nless').send({ tagId: foreign });
  expect(badTag.status).toBe(404);
  const foreignShop = '/api/v1/businesses/' + b + '/crm';
  expect((await outsider.get(foreignShop + '/customers/' + one)).status).toBe(404);
  const conv = await db.one<{ id: string }>('SELECT id FROM conversations WHERE business_id=$1 AND customer_id=$2 LIMIT 1', [a, one]);
  const panel = await staff.get(prefix + '/conversations/' + conv.id + '/panel');
  expect(panel.status).toBe(200);
  expect(panel.body.data).toMatchObject({ customerId: one, canEditTags: true, canCreateTags: false });
  expect(panel.body.data.detail.externalId).toBeUndefined();
  expect((await outsider.get(foreignShop + '/conversations/' + conv.id + '/panel')).status).toBe(404);
  const list = await staff.get(prefix + '/customers').query({ tagId: vip, consent: 'granted', q: 'Customer' });
  expect(list.status).toBe(200);
  expect(list.body.data.items.map((r: { id: string }) => r.id)).toEqual([one]);
  const consentPath = prefix + '/customers/' + two + '/consent';
  expect((await staff.put(consentPath).set(header, 'nless').send({ status: 'granted', attestation: true })).status).toBe(403);
  expect((await admin.put(consentPath).set(header, 'nless').send({ status: 'granted' })).status).toBe(400);
  await admin.put(consentPath).set(header, 'nless').send({ status: 'granted', attestation: true }).expect(400);
  await admin.put(consentPath).set(header, 'nless').send({ status: 'granted', attestation: true, reason: 'Synthetic explicit opt-in' }).expect(200);
  const revoked = await staff.put(consentPath).set(header, 'nless').send({ status: 'revoked' }).expect(200);
  expect(revoked.body.data.consent.history[0].status).toBe('revoked');
  const tag = await admin.post(prefix + '/tags').set(header, 'nless').send({ name: 'route-' + randomUUID().slice(0, 8) }).expect(201);
  const path = prefix + '/tags/' + tag.body.data.id;
  try {
    await admin.patch(path).set(header, 'nless').send({ expectedVersion: 1, name: 'edit-' + randomUUID().slice(0, 8) }).expect(200);
    await admin.patch(path).set(header, 'nless').send({ expectedVersion: 1, color: 'blue' }).expect(409);
  } finally { await admin.delete(path).set(header, 'nless').expect(204); }
});


test('five same-time identities page without duplicates and share their primary person’s tags', async () => {
  const ids = Array.from({ length: 5 }, () => randomUUID());
  const tag = await makeTag('page-' + randomUUID().slice(0,8));
  try {
    await db.query(`INSERT INTO customers (id,business_id,channel,external_id,display_name,created_at)
      SELECT id,$1,'web','crm-test-'||id::text,'Synthetic visitor','2026-01-01T00:00:00.123456Z'
      FROM unnest($2::uuid[]) AS ids(id)`, [a,ids]);
    await db.query(`INSERT INTO crm_person_members(customer_id,business_id,person_id)
      SELECT member,$1,$2 FROM unnest($3::uuid[]) AS members(member)`,[a,ids[0],ids.slice(1)]);
    await assignTag(owner,ids[2],{tagId:tag.id});
    expect((await listTags(a)).find(item=>item.id===tag.id)?.customerCount).toBe(5);
    const collected:string[]=[];
    let cursor:string|null=null;
    do {
      const page=await listCustomersByTags(a,[tag.id],{limit:2,cursor});
      collected.push(...page.items.map(row=>row.id));
      cursor=page.nextCursor;
    } while (cursor);
    expect(collected).toEqual(ids.sort());
    expect((await getCustomer(a,ids[1]))?.tagIds).toContain(tag.id);
  } finally {
    await deleteTag(owner,tag.id);
    await db.query('DELETE FROM customers WHERE business_id=$1 AND id=ANY($2::uuid[])',[a,ids]);
  }
});

test('the tag limit applies across concurrent requests without blocking existing tag assignments', async () => {
  const prefix='fill-'+randomUUID().slice(0,8)+'-';
  const initial=await listTags(a);
  await db.query(`INSERT INTO crm_tags(business_id,name,name_key) SELECT $1,$2::text||i,$2::text||i
    FROM generate_series(1,$3::int) AS series(i)`,[a,prefix,30-initial.length]);
  try {
    await expect(makeTag(prefix+'overflow')).rejects.toMatchObject({details:{reason:'tag_limit'}});
    await expect(assignTag(owner,one,{name:'VIP'})).resolves.toBeUndefined();
  } finally {
    await db.query('DELETE FROM crm_tags WHERE business_id=$1 AND starts_with(name_key,$2)',[a,prefix]);
  }
});

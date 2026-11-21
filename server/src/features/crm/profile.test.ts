import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import * as core from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { listCustomersByTags } from './service';

const shop = seedId('biz_demo_a');
const otherShop = seedId('biz_demo_b');
const id = randomUUID();
const root = '/api/v1/businesses/'+shop+'/crm';
const profile = '/customers/'+id+'/profile';
const csrf = 'X-Requested-With';
let staff: Awaited<ReturnType<typeof createTestAgent>>;
let outsider: typeof staff;
let reader: typeof staff;
const readerMembership = randomUUID();
vi.setConfig({ testTimeout: 45000 });
beforeAll(async () => {
  [staff, outsider, reader] = await Promise.all([createTestAgent(), createTestAgent(), createTestAgent()]);
  await Promise.all([loginAs(staff,'staff.a@example.test'), loginAs(outsider,'owner.b@example.test'), loginAs(reader,'staff.b@example.test')]);
  await core.db.query(
    "INSERT INTO memberships (id,business_id,user_id,role,permissions) VALUES ($1,$2,$3,'staff',ARRAY['chat.read'])",
    [readerMembership, shop, seedId('staff_b')]);
  await core.db.query(`INSERT INTO customers (business_id,id,channel,external_id,display_name) VALUES ($1,$2,'web',$3,'Synthetic contact')`,
    [shop,id,'crm-test-'+id]);
}, 45000);
afterAll(async () => {
  await core.db.query('DELETE FROM memberships WHERE id=$1 AND business_id=$2', [readerMembership, shop]);
  await core.db.query('DELETE FROM customers WHERE business_id=$1 AND id=$2',[shop,id]);
  await closeDb();
});

test('scopes and validates profile writes, persists normalized contacts and audits only changed field names', async () => {
  const update = (data: object) => staff.patch(root+profile).set(csrf,'nless').send(data);
  await outsider.patch('/api/v1/businesses/'+otherShop+'/crm'+profile).set(csrf,'nless')
    .send({expectedVersion:1,note:'synthetic'}).expect(404);
  await reader.get(root+'/customers/'+id).expect(200);
  await reader.patch(root+profile).set(csrf,'nless').send({expectedVersion:1,note:'requires reply'}).expect(403);
  await update({expectedVersion:1,phone:'12'}).expect(400);
  await update({expectedVersion:1,email:'bad-email'}).expect(400);
  await update({expectedVersion:1,note:'x'.repeat(2001)}).expect(400);
  await update({expectedVersion:1}).expect(400);
  const broadcast = vi.spyOn(core,'publish');
  try {
    const race = await Promise.all([update({expectedVersion:1,phone:'080-000-0001'}),update({expectedVersion:1,phone:'080-000-0002'})]);
    expect(race.map(r=>r.status).sort()).toEqual([200,409]);
    const winner = race.find(r=>r.status===200)!.body.data;
    expect(winner.profileVersion).toBe(2);
    const changed = await update({expectedVersion:2,email:' Contact@Example.Test ',note:'Synthetic staff note'}).expect(200);
    expect(changed.body.data).toMatchObject({profileVersion:3,contact:{phone:winner.contact.phone,email:'contact@example.test'},note:'Synthetic staff note'});
    const read = await staff.get(root+'/customers/'+id).expect(200);
    expect(read.body.data.contact).toEqual(changed.body.data.contact);
    const conflict = await update({expectedVersion:2,note:'outdated'}).expect(409);
    expect(conflict.body.error.details).toEqual({currentVersion:3});
    const matches = await staff.get(root+'/customers').query({q:'contact@example'}).expect(200);
    expect(matches.body.data.items.map((r:{id:string})=>r.id)).toContain(id);
    const digits = await staff.get(root+'/customers').query({q:'0800000'}).expect(200);
    expect(digits.body.data.items.map((r:{id:string})=>r.id)).toContain(id);
    await update({expectedVersion:3,email:''}).expect(200);
    const after = await staff.get(root+'/customers/'+id).expect(200);
    expect(after.body.data).toMatchObject({profileVersion:4,contact:{email:null,phone:winner.contact.phone},note:'Synthetic staff note'});
    const events = await core.db.query<{details:{fields:string[]}}>(`SELECT details FROM audit_events WHERE business_id=$1 AND target_id=$2 AND action='crm.profile.update' ORDER BY created_at`,[shop,id]);
    expect(events.rows.map(row=>row.details)).toEqual([{fields:['phone']},{fields:['email','note']},{fields:['email']}]);
    for (const [businessId,event] of broadcast.mock.calls) {
      if(event.type==='custom' && event.featureId==='F24') {
        expect(businessId).toBe(shop);
        expect(event.data).toEqual({customerId:id});
      }
    }
    expect((await listCustomersByTags(shop,[seedId('tag_vip_a')])).items.every(customer => !('note' in customer) && !('contact' in customer))).toBe(true);
  } finally { broadcast.mockRestore(); }
});

import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { db, closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';

const shop = seedId('biz_demo_a');
const other = seedId('biz_demo_b');
const root = (id:string) => '/api/v1/businesses/' + id + '/orders/packing';
afterAll(closeDb);

async function order(businessId:string, shipByAt:string|null, method='shipping', status='paid') {
  const id=randomUUID();
  await db.query(`INSERT INTO orders(id,business_id,order_number,origin,delivery_method,subtotal_minor,delivery_fee_minor,total_minor,
    status,payment_state,ship_by_at) VALUES($1,$2,$3,'staff',$4,200,0,200,$5,'paid',$6)`,
    [id,businessId,'QA-'+id,method,status,shipByAt]);
  await db.query(`INSERT INTO order_items(order_id,business_id,line_no,item_id,sku,name,quantity,unit_price_minor,line_total_minor,catalog_version)
    VALUES($1,$2,1,$3,'BOX-TH','เกมรถไฟ กล่องแดง',2,100,200,1)`,[id,businessId,randomUUID()]);
  return id;
}

it('prints the right Bangkok day including unscheduled shipments and never other shops or closed work',async()=>{
  const agent=await createTestAgent();
  await loginAs(agent,'owner.a@example.test');
  const before=await order(shop,'2026-11-21T16:55:00Z');
  const after=await order(shop,'2026-11-21T17:05:00Z');
  const missing=await order(shop,null);
  const foreign=await order(other,null);
  const pickup=await order(shop,null,'pickup');
  const cancelled=await order(shop,null,'shipping','cancelled');
  const raw=await agent.get(root(shop)+'?day=2026-11-21');
  expect(raw.status).toBe(200);
  const ids=raw.body.data.items.map((o:{id:string})=>o.id);
  expect(ids).toEqual(expect.arrayContaining([before,missing]));
  for(const excluded of [after,foreign,pickup,cancelled]) expect(ids).not.toContain(excluded);
  expect(ids.indexOf(before)).toBeLessThan(ids.indexOf(missing));
  expect(raw.body.data.items.find((o:{id:string})=>o.id===before).items).toEqual([{name:'เกมรถไฟ กล่องแดง',sku:'BOX-TH',quantity:2}]);
  expect((await agent.get(root(other)+'?day=2026-11-21')).status).toBe(404);
  expect((await agent.get(root(shop)+'?day=2026-02-31')).status).toBe(400);

  const body={expectedVersion:1,shipByAt:'2026-11-22T00:05:00+07:00',address:{name:'คุณทดสอบ',line1:'ซอยสาธิต 7',postalCode:'10520'}};
  const url=root(shop)+'/'+missing;
  const put=()=>agent.put(url).set('X-Requested-With','nless').send(body);
  expect((await put()).status).toBe(200);
  expect((await put()).status).toBe(409);
  const next=await agent.get(root(shop)+'?day=2026-11-22');
  expect(next.body.data.items.find((o:{id:string})=>o.id===missing)).toMatchObject({address:body.address,shipByAt:'2026-11-21T17:05:00Z'});
});

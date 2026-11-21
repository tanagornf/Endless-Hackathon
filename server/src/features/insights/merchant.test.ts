import { randomUUID } from 'node:crypto';
import { afterAll, expect, it } from 'vitest';
import { closeDb, db } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, loginAs } from '../../core/test-utils';
import { saveMessage } from '../inbox/service';
import { merchantReport } from './merchant';

const shop = seedId('biz_demo_a');
const sku = 'REPORT-' + randomUUID();
afterAll(closeDb);

async function mention(businessId: string, origin: 'live' | 'demo') {
  const msg = await saveMessage({ businessId, customer: { channel: 'web', externalId: randomUUID() },
    direction: 'inbound', author: 'customer', origin, parts: [{ type: 'text', text: 'Is the train game available?' }], triggerAi: false });
  const item = { sku, name: 'Train game' };
  await db.query(`INSERT INTO ai_turns (business_id,conversation_id,inbound_message_id,inbound_created_at,state,finished_at,product_refs)
    VALUES ($1,$2,$3,now(),'completed',now(),$4::jsonb)`, [businessId,msg.conversation.id,msg.message.id,JSON.stringify([item,item])]);
  return msg.conversation.id;
}

it('counts distinct live chats, same-chat purchases, and isolates identical SKUs by shop', async () => {
  const bought = await mention(shop, 'live');
  await mention(shop, 'live');
  await mention(shop, 'demo');
  await mention(seedId('biz_demo_b'), 'live');
  const order = await db.one<{ id: string }>(`INSERT INTO orders
    (business_id,order_number,conversation_id,origin,delivery_method,subtotal_minor,delivery_fee_minor,total_minor)
    VALUES($1,$2,$3,'staff','shipping',200,0,200) RETURNING id`,[shop,randomUUID(),bought]);
  await db.query(`INSERT INTO order_items
    (order_id,business_id,line_no,item_id,sku,name,quantity,unit_price_minor,line_total_minor,catalog_version)
    VALUES($1,$2,1,$3,$4,'Train game',2,100,200,1)`,[order.id,shop,randomUUID(),sku]);
  const report = await merchantReport(shop,7);
  expect(report.products.find(row => row.sku === sku)).toMatchObject({ conversations: 2, withoutOrder: 1 });
  await db.query("UPDATE orders SET status='cancelled' WHERE business_id=$1 AND id=$2",[shop,order.id]);
  const cancelled = await merchantReport(shop,7);
  expect(cancelled.products.find(row => row.sku === sku)?.withoutOrder).toBe(2);
});

it('enforces shop access and validates report windows at the HTTP boundary', async () => {
  const agent = await createTestAgent();
  const path = (id: string) => '/api/v1/businesses/' + id + '/insights/merchant';
  expect((await agent.get(path(shop))).status).toBe(401);
  await loginAs(agent,'owner.a@example.test');
  expect((await agent.get(path(shop) + '?days=7')).status).toBe(200);
  expect((await agent.get(path(shop) + '?days=365')).status).toBe(400);
  expect((await agent.get(path(seedId('biz_demo_b')))).status).toBe(404);
});

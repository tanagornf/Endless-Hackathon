import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SEED } from '@nless/shared/core/fixtures';
import { db } from '../../core';
import { closeDb } from '../../core/db';
import { createTestAgent, loginAs, drainJobs } from '../../core/test-utils';
import { getHistory, saveMessage } from '../inbox/service';
import { createOrderFromProposal } from '../orders/service';
import { onOrderConfirmed } from './message';
import { createPaymentRequestForOrder, getDetail, listRequests, publicPayment } from './request';
import { getSettings } from './settings';

const [a,b]=SEED.businesses;
const path='/api/v1/businesses/'+a.id+'/payments';
const sku='F14-'+randomUUID();
let admin:Awaited<ReturnType<typeof createTestAgent>>;
beforeAll(async ()=>{
  admin=await createTestAgent();
  await loginAs(admin,'owner.a@example.test');
  const response=await admin.post('/api/v1/businesses/'+a.id+'/catalog/items').set('X-Requested-With','nless')
    .send({sku,kind:'product',name:'สินค้าทดสอบ',nameEn:'QR fixture',priceMinor:12500,stock:8,shippable:true});
  expect(response.status).toBe(201);
},45000);
async function confirmed(language:'en'|'th') {
  const conversation=(await saveMessage({businessId:a.id,customer:{channel:'web',externalId:'q-'+randomUUID()},
    direction:'inbound',author:'customer',parts:[{type:'text',text:language==='en'?'How much is this?':'ราคาเท่าไหร่คะ'}],triggerAi:false})).conversation;
  const quote=await createOrderFromProposal({stage:'propose',businessId:a.id,conversationId:conversation.id,items:[{ref:{sku},quantity:1}],
    deliveryMethod:'pickup',clientRequestId:'quote:'+randomUUID()});
  if(quote.stage!=='propose') throw Error('Expected proposal');
  const result=await createOrderFromProposal({stage:'confirm',businessId:a.id,conversationId:conversation.id,actor:{kind:'customer'},
    proposalId:quote.proposal.id,version:quote.proposal.version,reviewToken:quote.proposal.reviewToken,clientRequestId:'yes:'+randomUUID(),decision:'confirm'});
  if(result.stage!=='confirm' || !result.order) throw Error('Expected payable order');
  return result.order;
}
describe.sequential('Payment requests',()=>{
  it('scopes settings, masks the recipient and validates optimistic updates',async ()=>{
    const previous=await getSettings(a.id);
    const input={expectedVersion:previous.version,promptpayKind:'mobile',promptpayId:'0812345678',receiverName:'Demo receiver',
      requestTtlMinutes:90,includeReference:false};
    const update=(body:object)=>admin.put(path+'/settings').set('X-Requested-With','nless').send(body);
    const first=await update(input);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({configured:true,promptpayMasked:'xxx-xxx-5678',version:previous.version+1});
    expect(JSON.stringify(first.body.data)).not.toContain('0812345678');
    expect((await update(input)).status).toBe(409);
    expect((await update({...input,expectedVersion:first.body.data.version,promptpayId:'invalid'})).status).toBe(400);
    const preview=await admin.post(path+'/settings/test-qr').set('X-Requested-With','nless').send({});
    expect(preview.body.data.pngBase64).toMatch(/^iVBOR/);
    expect((await admin.get('/api/v1/businesses/'+b.id+'/payments/settings')).status).toBe(404);
  },45000);
  it.each(['en','th'] as const)('issues one request, protects replay and delivers a %s QR link exactly once',async language=>{
    const order=await confirmed(language);
    const [one,two]=await Promise.all([createPaymentRequestForOrder(a.id,order.id),createPaymentRequestForOrder(a.id,order.id)]);
    expect(one.id).toBe(two.id);
    expect(one.qrFileId).toBe(two.qrFileId);
    const link=one.payUrl || two.payUrl;
    expect([one,two].filter(item=>item.payUrl)).toHaveLength(1);
    const token=new URL(link).pathname.split('/').at(-1)!;
    const page=await publicPayment(token);
    expect(page).toMatchObject({orderNumber:one.orderNumber,state:'open',amountMinor:12500,language,mode:'sandbox'});
    expect(page.qrImageBase64).toMatch(/^iVBOR/);
    expect((await getDetail(a.id,one.id)).payUrl).toBe('');
    await expect(getDetail(b.id,one.id)).rejects.toMatchObject({code:'NOT_FOUND'});
    expect((await listRequests(b.id,{orderId:order.id,limit:5})).items).toEqual([]);
    const rows=await listRequests(a.id,{orderId:order.id,limit:5});
    expect(rows.items.map(item=>item.id)).toEqual([one.id]);
    expect((await admin.get('/api/v1/public/payments/'+token)).headers['cache-control']).toContain('no-store');
    await expect(onOrderConfirmed(order)).rejects.toMatchObject({retryable:true});
    await drainJobs({type:'core.deliver'});
    await onOrderConfirmed(order);
    await onOrderConfirmed(order);
    const history=await getHistory(order.conversationId!,{businessId:a.id,limit:100});
    const messages=history.items.filter(item=>item.parts.some(part=>part.type==='image' && part.fileId===one.qrFileId));
    expect(messages).toHaveLength(1);
    expect(messages[0].delivery.state).toBe('sent');
    expect(messages[0].parts[0]).toMatchObject({type:'text',text:expect.stringContaining(language==='en'?'do not transfer':'อย่าโอนเงินจริง')});
    const row=await db.one<{pending_link_enc:string|null;public_token_hash:string}>('SELECT pending_link_enc,public_token_hash FROM payment_requests WHERE business_id=$1 AND id=$2',[a.id,one.id]);
    expect(row.pending_link_enc).toBeNull();
    expect(row.public_token_hash).toMatch(/^[a-f0-9]{64}$/);
    await db.query("UPDATE payment_requests SET expires_at=now()-interval '1 minute' WHERE business_id=$1 AND id=$2",[a.id,one.id]);
    expect(await publicPayment(token)).toMatchObject({state:'expired',qrImageBase64:null});
  },90000);
  it('returns the exact F13 fallback reason when disabled',async ()=>{
    const order=await confirmed('en');
    const previous=await db.one<{kind:string;enc:string;masked:string}>('SELECT promptpay_kind AS kind,promptpay_id_enc AS enc,promptpay_masked AS masked FROM payment_settings WHERE business_id=$1',[a.id]);
    await db.query('UPDATE payment_settings SET promptpay_kind=NULL,promptpay_id_enc=NULL,promptpay_masked=NULL WHERE business_id=$1',[a.id]);
    try {await expect(onOrderConfirmed(order)).rejects.toMatchObject({code:'POLICY_BLOCKED',details:{reason:'payments_not_configured'}});}
    finally {await db.query('UPDATE payment_settings SET promptpay_kind=$2,promptpay_id_enc=$3,promptpay_masked=$4 WHERE business_id=$1',[a.id,previous.kind,previous.enc,previous.masked]);}
    expect((await admin.get('/api/v1/public/payments/invalid')).status).toBe(404);
  },45000);
});
afterAll(closeDb);

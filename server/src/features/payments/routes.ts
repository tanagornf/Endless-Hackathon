import { z } from 'zod';
import { AppError, assertRateLimit, defineFeatureRoutes } from '../../core';
import { registerOrderHook } from '../orders/service';
import { onOrderConfirmed } from './message';
import { createPaymentRequestForOrder, getDetail, listQuery, listRequests, publicPayment } from './request';
import { getSettings, saveSettings, testQr, updateSettingsBody } from './settings';
const base='/businesses/:businessId/payments';
function id(value:string) {
  if(!z.uuid().safeParse(value).success) throw new AppError('NOT_FOUND','Payment resource not found');
  return value;
}
export default defineFeatureRoutes({featureId:'F14',slug:'payments',register(api) {
  registerOrderHook('confirmed',onOrderConfirmed);
  api.get(base+'/settings',{auth:'business',permission:'business.commerce',summary:'Read masked payment settings'},
    async ({business})=>getSettings(business!.id));
  api.put(base+'/settings',{auth:'business',permission:'business.commerce',summary:'Configure PromptPay',body:updateSettingsBody},
    async ({business,user,body})=>saveSettings(business!.id,user!.id,body));
  api.post(base+'/settings/test-qr',{auth:'business',permission:'business.commerce',summary:'Preview a PromptPay QR',
    body:z.strictObject({amountMinor:z.number().int().positive().max(9999999999).default(100)})},
    async ({business,body})=>testQr(business!.id,body.amountMinor));
  api.get(base,{auth:'business',permission:'orders.read',summary:'List payment requests',query:listQuery},
    async ({business,query})=>listRequests(business!.id,query));
  api.get(base+'/:requestId',{auth:'business',permission:'orders.read',summary:'Read payment request'},
    async ({business,params})=>getDetail(business!.id,id(params.requestId)));
  api.post('/businesses/:businessId/orders/:orderId/payment-request',{auth:'business',permission:'orders.write',summary:'Issue payment request',body:z.strictObject({})},
    async ({business,user,params})=>createPaymentRequestForOrder(business!.id,id(params.orderId),{actorUserId:user!.id}));
  api.get('/public/payments/:token',{auth:'none',summary:'Read public payment request'},async ({req,res,params})=>{
    assertRateLimit({key:'payment-link:'+req.ip,limit:90,windowSeconds:60});
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    return publicPayment(params.token);
  });
}});

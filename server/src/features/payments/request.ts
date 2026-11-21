import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { PaymentRequestDetail, PaymentRequestRow, PublicPaymentView } from '@nless/shared/features/payments/types';
import { AppError, auditInTransaction, config, db, decryptSecret, encryptSecret, providerMode, publish, storage } from '../../core';
import { getBusinessProfile, getBusinessSettings } from '../business-settings/service';
import { getCustomerLanguage } from '../inbox/service';
import { getOrderForPayment } from '../orders/service';
import { recipient, renderQr, type Recipient } from './settings';

type Order = Awaited<ReturnType<typeof getOrderForPayment>>;
type Row = Omit<PaymentRequestRow,'orderNumber'|'customerName'|'expiresAt'|'paidAt'|'createdAt'> & {
  businessId:string; expiresAt:Date; paidAt:Date|null; createdAt:Date; receiverName:string; receiverMasked:string;
  qrFileId:string|null; encrypted:string; kind:Recipient['promptpayKind']; reference:string; includeReference:boolean; pendingLink:string|null;
};
const fields = `id,business_id AS "businessId",order_id AS "orderId",conversation_id AS "conversationId",amount_minor::float8 AS "amountMinor",
  CASE WHEN state='open' AND expires_at<=now() THEN 'expired' ELSE state END AS state,failed_attempts AS "failedAttempts",
  escalated_at IS NOT NULL AS escalated,expires_at AS "expiresAt",paid_at AS "paidAt",paid_by AS "paidBy",method,mode,
  created_at AS "createdAt",version,receiver_name AS "receiverName",receiver_masked AS "receiverMasked",qr_file_id AS "qrFileId",
  receiver_id_enc AS encrypted,receiver_kind AS kind,reference_code AS reference,include_reference AS "includeReference",pending_link_enc AS "pendingLink"`;
const tokenHash=(value:string)=>createHash('sha256').update(value).digest('hex');
const blocked=(reason:string)=>new AppError('POLICY_BLOCKED','Payment request unavailable',{details:{reason}});
function summary(row:Row, order:Order): PaymentRequestRow {
  return {id:row.id,orderId:row.orderId,orderNumber:order.orderNumber,customerName:order.customerName,conversationId:row.conversationId,
    amountMinor:row.amountMinor,state:row.state,failedAttempts:row.failedAttempts,escalated:row.escalated,expiresAt:row.expiresAt.toISOString(),
    paidAt:row.paidAt?.toISOString() ?? null,paidBy:row.paidBy,method:row.method,mode:row.mode,createdAt:row.createdAt.toISOString(),version:row.version};
}
function detail(row:Row,order:Order,payUrl=''):PaymentRequestDetail {
  return {...summary(row,order),qrFileId:row.qrFileId,payUrl,receiverMasked:row.receiverMasked,receiverName:row.receiverName,slips:[],receipt:null};
}
async function getRow(businessId:string,id:string) {
  const row=await db.maybeOne<Row>(`SELECT ${fields} FROM payment_requests WHERE business_id=$1 AND id=$2`,[businessId,id]);
  if (!row) throw new AppError('NOT_FOUND','Payment request not found');
  return row;
}
export async function getDetail(businessId:string,id:string) {
  const row=await getRow(businessId,id);
  return detail(row,await getOrderForPayment(businessId,row.orderId));
}
export const listQuery=z.object({cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(30),
  state:z.enum(['open','pending_verification','paid','expired','superseded','cancelled']).optional(),orderId:z.uuid().optional()});
export async function listRequests(businessId:string,query:z.infer<typeof listQuery>) {
  const {rows}=await db.query<Row>(`WITH requests AS (SELECT ${fields} FROM payment_requests WHERE business_id=$1)
    SELECT * FROM requests WHERE ($2::text IS NULL OR state=$2) AND ($3::uuid IS NULL OR "orderId"=$3)
    AND ($4::uuid IS NULL OR ("createdAt",id)<(SELECT "createdAt",id FROM requests WHERE id=$4))
    ORDER BY "createdAt" DESC,id DESC LIMIT $5`,[businessId,query.state??null,query.orderId??null,query.cursor??null,query.limit+1]);
  const page=rows.slice(0,query.limit);
  return {items:await Promise.all(page.map(async row=>summary(row,await getOrderForPayment(businessId,row.orderId)))),
    nextCursor:rows.length>query.limit?page.at(-1)!.id:null};
}
export async function createPaymentRequestForOrder(businessId:string,orderId:string,opts?:{actorUserId?:string|null}) {
  const order=await getOrderForPayment(businessId,orderId);
  if(order.status!=='awaiting_payment' || order.paymentState!=='unpaid' || order.totalMinor<=0) throw blocked('order_not_payable');
  const result=await db.tx(async tx=>{
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['payment-request:'+orderId]);
    const previous=await tx.maybeOne<Row>(`SELECT ${fields} FROM payment_requests WHERE business_id=$1 AND order_id=$2
      AND state IN ('open','pending_verification')`,[businessId,orderId]);
    if(previous) return {row:previous,url:''};
    const shop=await recipient(businessId,tx);
    if(!shop?.encrypted || !shop.promptpayKind) throw blocked('payments_not_configured');
    const token=randomBytes(24).toString('base64url');
    const url=(config.PUBLIC_BASE_URL||config.APP_BASE_URL).replace(/\/$/,'')+'/payments/pay/'+token;
    const reference=order.orderNumber.replace(/-/g,'');
    const row=await tx.one<Row>(`INSERT INTO payment_requests
      (business_id,order_id,conversation_id,amount_minor,reference_code,include_reference,receiver_kind,receiver_id_enc,receiver_masked,
      receiver_name,public_token_hash,pending_link_enc,expires_at,mode,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()+$13::int*interval '1 minute',$14,$15) RETURNING ${fields}`,
      [businessId,orderId,order.conversationId,order.totalMinor,reference,shop.includeReference,shop.promptpayKind,shop.encrypted,shop.promptpayMasked,
        shop.receiverName,tokenHash(token),order.conversationId ? encryptSecret(url):null,shop.requestTtlMinutes,providerMode('payment'),opts?.actorUserId??null]);
    await auditInTransaction(tx,[{action:'payments.request.create',businessId,actorUserId:opts?.actorUserId??null,targetType:'payment_request',
      targetId:row.id,details:{orderId,amountMinor:order.totalMinor,mode:row.mode}}]);
    return {row,url};
  });
  let row=result.row;
  if (!row.qrFileId && row.state==='open') {
    const {bytes}=await renderQr({promptpayKind:row.kind,encrypted:row.encrypted,includeReference:row.includeReference},row.amountMinor,row.reference);
    const file=await storage.save({businessId,uploadedBy:null,purpose:'payment-qr',originalName:'payment-qr.png',mimeType:'image/png',bytes,allowedMime:['image/png']});
    // Concurrent recoveries all return the persisted file.
    row=await db.one<Row>(`UPDATE payment_requests SET qr_file_id=COALESCE(qr_file_id,$3) WHERE business_id=$1 AND id=$2 RETURNING ${fields}`,
      [businessId,row.id,file.id]);
  }
  if(result.url) await publish(businessId,{type:'custom',featureId:'F14',name:'payments.changed',data:{requestId:row.id}});
  return detail(row,order,result.url);
}
export async function pendingMessageLink(businessId:string,id:string) {
  const row=await getRow(businessId,id);
  return row.state==='open' && row.pendingLink ? decryptSecret(row.pendingLink):null;
}
export async function publicPayment(token:string):Promise<PublicPaymentView> {
  if(!/^[\w-]{32}$/.test(token)) throw new AppError('NOT_FOUND','Payment link not found');
  const row=await db.maybeOne<Row>(`SELECT ${fields} FROM payment_requests WHERE public_token_hash=$1`,[tokenHash(token)]);
  if(!row) throw new AppError('NOT_FOUND','Payment link not found');
  const {businessId}=row;
  const [order,shop,language,file]=await Promise.all([getOrderForPayment(businessId,row.orderId),getBusinessProfile(businessId),
    row.conversationId?getCustomerLanguage(row.conversationId,{businessId}):getBusinessSettings(businessId).then(shop=>shop.language),
    row.state==='open' && row.qrFileId?storage.read(row.qrFileId,{businessId}):null]);
  const payable=order.status==='awaiting_payment' && order.paymentState==='unpaid';
  const state=row.state==='open' && !payable ? (order.paymentState==='paid'?'paid':order.status==='cancelled'?'cancelled':'expired'):row.state;
  return {shopName:shop.name,orderNumber:order.orderNumber,amountMinor:row.amountMinor,state,
    expiresAt:row.expiresAt.toISOString(),qrImageBase64:file && payable?Buffer.from(file.bytes).toString('base64'):null,receiverMasked:row.receiverMasked,
    receiverName:row.receiverName,mode:row.mode,attemptsLeft:Math.max(0,3-row.failedAttempts),receipt:null,language};
}

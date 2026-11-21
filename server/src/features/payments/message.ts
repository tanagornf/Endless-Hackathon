import { formatMoneyText } from '@nless/shared/core/language';
import type { OrderSummary } from '@nless/shared/features/orders/types';
import { AppError, db, jobs, sendToCustomer } from '../../core';
import { getConversation, getCustomerLanguage, getHistory } from '../inbox/service';
import { createPaymentRequestForOrder, pendingMessageLink } from './request';

export async function onOrderConfirmed(order:OrderSummary) {
  const {businessId, conversationId}=order;
  if(!conversationId) return;
  const payment=await createPaymentRequestForOrder(businessId,order.id);
  const url=await pendingMessageLink(businessId,payment.id);
  if(!url) return;
  if(!payment.qrFileId) throw new AppError('SERVICE_NOT_READY','Payment QR unavailable',{retryable:true});
  const language=await getCustomerLanguage(conversationId,{businessId});
  const amount=formatMoneyText(payment.amountMinor,language);
  const sandbox=payment.mode==='sandbox';
  const text=language==='en'
    ? (sandbox?'Test payment. Please do not transfer money. ':'')+'Amount due: '+amount+'. Open the payment page to view the QR.'
    : (sandbox?'ทดสอบเท่านั้น กรุณาอย่าโอนเงินจริง ':'')+'ยอดชำระ '+amount+' เปิดหน้าชำระเงินเพื่อดูคิวอาร์โค้ด';
  const target=new URL(url);
  let buttonUrl=url;
  if(target.protocol!=='https:') {
    const conversation=await getConversation(conversationId,{businessId});
    if(conversation?.channel!=='web' || target.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(target.hostname))
      throw new AppError('SERVICE_NOT_READY','External payment messages require a public HTTPS origin',{retryable:true});
    buttonUrl=target.pathname;
  }
  const label=language==='en'?'Open payment page':'เปิดหน้าชำระเงิน';
  const sent=await sendToCustomer(conversationId,[{type:'text',text},{type:'image',fileId:payment.qrFileId,alt:label},
    {type:'action_buttons',buttons:[{id:'pay',label,action:{kind:'link',url:buttonUrl}}]}],
    {businessId,author:'ai',origin:'system',clientRequestId:'pay-request:'+payment.id});
  const job=await jobs.get(sent.jobId);
  if(job?.state==='succeeded') {
    let before:string|null=null;
    do {
      const history=await getHistory(conversationId,{businessId,before,limit:100});
      const message=history.items.find(item=>item.id===sent.messageId);
      if(message?.delivery.state==='sent') {
        await db.query('UPDATE payment_requests SET pending_link_enc=NULL WHERE business_id=$1 AND id=$2',[businessId,payment.id]);
        return;
      }
      if(message) break;
      before=history.nextCursor;
    } while(before);
  }
  throw new AppError('SERVICE_NOT_READY','Payment message awaits delivery',{retryable:true});
}

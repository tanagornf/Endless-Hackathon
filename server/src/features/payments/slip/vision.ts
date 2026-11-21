import sharp from 'sharp';
import { z } from 'zod';
import { model } from '../../../core';
import { prompt, schema } from './vision-prompt';

const optionalText=z.string().max(200).nullable();
export const visionFields=z.strictObject({
  is_transfer_slip:z.boolean(),amount_text:optionalText,transferred_at_iso:optionalText,transaction_ref:optionalText,
  sending_bank:optionalText,receiver_bank:optionalText,sender_name:optionalText,receiver_name:optionalText,
  receiver_account_masked:optionalText,legibility:z.number().finite().transform(n=>Math.max(0,Math.min(n,1))),tamper_suspected:z.boolean(),tamper_note:optionalText,
});
export type Vision=z.infer<typeof visionFields>;
export async function readVision(businessId:string,bytes:Uint8Array,signal?:AbortSignal) {
  const jpg=await sharp(bytes,{limitInputPixels:36_000_000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer();
  const response=await model.chat({usage:{businessId,featureId:'F14',purpose:'slip-read'},model:'chat',reasoningEffort:'low',
    maxOutputTokens:1400,timeoutMs:20000,signal,responseFormat:{name:'slip_read',schema,strict:true},
    messages:[{role:'developer',content:prompt},{role:'user',content:[{type:'text',text:'Read this transfer slip and return the JSON.'},
      {type:'image',dataUrl:'data:image/jpeg;base64,'+jpg.toString('base64'),detail:'high'}]}]});
  const validated=visionFields.safeParse(response.json);
  return response.finishReason==='stop' && validated.success ? validated.data:null;
}

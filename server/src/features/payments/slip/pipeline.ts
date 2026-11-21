import { randomInt } from 'node:crypto';
import type { SlipAnalysis,SlipAnalysisInput,SlipVerdict } from '@nless/shared/features/payments/types';
import { AppError,config,db,storage } from '../../../core';
import { decodeQr } from './decode';
import { normalizeRef, type ParsedQr } from './qrparse';
import { matchReceiver } from './receiver';
import { readVision, type Vision } from './vision';

export function amountMinor(text:string|null) {
  if (!text) return null;
  const value=text.replace(/[๐-๙]/gu,c=>String(c.charCodeAt(0)-0x0e50)).trim().replace(/^฿\s*/u,'').replace(/\s*(?:บาท|THB)$/iu,'');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole,fraction='']=value.replace(/,/g,'').split('.');
  const minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(minor)?minor:null;
}
function instant(value:string|null) {
  if(!value || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/u.test(value)) return null;
  const time=Date.parse(value), year=Number(value.slice(0,4)), current=new Date().getUTCFullYear();
  return Number.isFinite(time) && year>=current-1 && year<=current ? new Date(time).toISOString():null;
}
function blank(mode:SlipAnalysis['mode'],reason:string|null):SlipAnalysis {
  return {mode,verdict:'technical',confidence:0,amountMinor:null,transferredAt:null,transactionRef:null,receiverName:null,receiverLast4:null,
    qr:{found:false,sendingBank:null,transactionRef:null},checks:[],autoAcceptable:false,needsStaffReason:reason};
}
export function evaluate(input:SlipAnalysisInput,vision:Vision,qr:ParsedQr,duplicate:boolean):SlipAnalysis {
  const expected=input.expected;
  const amount=amountMinor(vision.amount_text);
  const time=instant(vision.transferred_at_iso);
  const readRef=normalizeRef(vision.transaction_ref??'');
  const validRef=readRef.length>=8 && readRef.length<=35?readRef:null;
  const ref=qr.transactionRef??validRef;
  const agree=!qr.transactionRef || !validRef || qr.transactionRef===validRef;
  const receiver=matchReceiver(expected.receiverPromptPayId,expected.receiverName,vision.receiver_account_masked,vision.receiver_name);
  const inTime=!!time && (!expected.notBefore || Date.parse(time)>=Date.parse(expected.notBefore)) && (!expected.notAfter || Date.parse(time)<=Date.parse(expected.notAfter));
  const checks:SlipAnalysis['checks']=[
    {name:'is_slip',pass:vision.is_transfer_slip,detail:'document type'},
    {name:'legible',pass:vision.legibility>=.6,detail:'read confidence'},
    {name:'qr_present',pass:qr.kind==='slip',detail:qr.kind},
    {name:'qr_crc',pass:qr.kind!=='crc_bad',detail:qr.kind==='crc_bad'?'CRC mismatch':'CRC check'},
    {name:'ref_present',pass:!!ref,detail:'reference availability'},
    {name:'ref_match',pass:agree,detail:'printed and QR references'},
    {name:'tamper',pass:!vision.tamper_suspected,detail:'visual consistency'},
    {name:'duplicate',pass:!duplicate,detail:duplicate?'seen before':'unused reference'},
    {name:'receiver',pass:receiver.pass===true,detail:receiver.detail},
    {name:'amount',pass:amount===expected.amountMinor,detail:'amount comparison'},
    {name:'time',pass:inTime,detail:'transfer window'},
  ];
  let verdict:SlipVerdict='verified',reason:string|null=null;
  if(!vision.is_transfer_slip || vision.legibility<.6 || amount===null || !ref) {
    verdict='unreadable';
    reason=!vision.is_transfer_slip?'not_a_slip':vision.legibility<.6?'illegible':amount===null?'amount_unreadable':'no_reference';
  } else if(!agree || vision.tamper_suspected || qr.kind==='crc_bad') {
    verdict='suspected_forgery';reason=!agree?'ref_mismatch':vision.tamper_suspected?'tamper':'qr_crc';
  } else if(duplicate) verdict='duplicate';
  else if(receiver.pass===false) verdict='wrong_account';
  else if(amount!==expected.amountMinor) verdict='wrong_amount';
  else if(time&&!inTime) verdict='wrong_date';
  else if(!time || receiver.pass===null) {verdict='unreadable';reason=!time?'no_time':'receiver_unclear';}
  else reason=qr.kind!=='slip'?'no_qr':vision.legibility<.85?'low_confidence':!receiver.strong?'receiver_name_only':null;
  const digits=vision.receiver_account_masked?.match(/\d{4,}/g)?.at(-1)??'';
  return {verdict,mode:'vision',confidence:vision.legibility,amountMinor:amount,transferredAt:time,transactionRef:ref,
    receiverName:vision.receiver_name,receiverLast4:digits?digits.slice(-4):null,
    qr:{found:qr.kind==='slip',sendingBank:qr.sendingBank,transactionRef:qr.transactionRef},checks,
    autoAcceptable:verdict==='verified' && reason===null,needsStaffReason:reason};
}
export async function runSlipPipeline(input:SlipAnalysisInput, signal?:AbortSignal):Promise<SlipAnalysis> {
  const stored=await storage.read(input.fileId,{businessId:input.businessId});
  if(!stored) throw new AppError('NOT_FOUND','Slip image not found');
  if(!['image/png','image/jpeg','image/webp'].includes(stored.file.mimeType)) throw new AppError('VALIDATION_ERROR','Unsupported slip image');
  if(config.SLIP_VERIFY_MODE==='sandbox'){
    const outcome=input.sandboxOutcome??'unreadable';
    const result=blank('sandbox',outcome==='timeout'?'simulated_timeout':null);
    result.verdict=outcome==='timeout'?'technical':outcome;
    result.checks=[{name:'sandbox',pass:outcome==='verified',detail:'SIMULATOR'}];
    if(outcome==='verified'){
      result.autoAcceptable=true; result.amountMinor=input.expected.amountMinor;
      result.transactionRef='SANDBOX'+String(randomInt(0,10000000000)).padStart(10,'0');
    }
    return result;
  }
  let qr:ParsedQr,vision:Vision|null;
  try {
    signal?.throwIfAborted();
    [qr,vision]=await Promise.all([decodeQr(stored.bytes),readVision(input.businessId,stored.bytes,signal)]);
    signal?.throwIfAborted();
  } catch(error) {
    signal?.throwIfAborted();
    return blank('vision',error instanceof AppError && error.code==='PROVIDER_BUDGET_EXHAUSTED'?'provider_budget':'vision_failed');
  }
  if(!vision) return blank('vision','vision_failed');
  const ref=qr.transactionRef??normalizeRef(vision.transaction_ref??'');
  const duplicate=!!ref && !!await db.maybeOne('SELECT ref_key FROM slip_refs WHERE business_id=$1 AND ref_key=$2',[input.businessId,ref]);
  return evaluate(input,vision,qr,duplicate);
}
export async function analyzeSlip(input:SlipAnalysisInput):Promise<SlipAnalysis> {
  const result=await runSlipPipeline(input);
  if(input.dryRun || result.verdict!=='verified' || !result.transactionRef) return result;
  const claim=await db.query(`INSERT INTO slip_refs (business_id,ref_key,source) VALUES ($1,$2,$3)
    ON CONFLICT (business_id,ref_key) DO NOTHING RETURNING ref_key`,[input.businessId,normalizeRef(result.transactionRef),result.qr.found?'qr':'vision']);
  if(!claim.rowCount) return {...result,verdict:'duplicate',autoAcceptable:false,needsStaffReason:null,
    checks:result.checks.map(check=>check.name==='duplicate'?{...check,pass:false,detail:'seen before'}:check)};
  return result;
}

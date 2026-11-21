import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { SEED } from '@nless/shared/core/fixtures';
import type { SlipAnalysisInput } from '@nless/shared/features/payments/types';
import { AppError, config, db, model, storage } from '../../../core';
import { closeDb } from '../../../core/db';
import { analyzeSlip, evaluate } from './pipeline';
import * as visionApi from './vision';
import type { Vision } from './vision';
import { emptyQr } from './qrparse';
const now=new Date();
const ref='DEMO'+randomUUID().replace(/-/g,'').slice(0,16).toUpperCase();
const base:SlipAnalysisInput={businessId:SEED.businesses[0].id,fileId:randomUUID(),expected:{amountMinor:149000,
  receiverPromptPayId:'0812345678',receiverName:'Demo shop',notBefore:now.toISOString(),notAfter:new Date(+now+3600_000).toISOString()},dryRun:true};
const vision:Vision={is_transfer_slip:true,amount_text:'1,490.00',transferred_at_iso:now.toISOString(),transaction_ref:ref,sending_bank:null,
  receiver_bank:null,sender_name:null,receiver_name:'Demo shop',receiver_account_masked:'xxx-xxx-5678',legibility:.96,tamper_suspected:false,tamper_note:null};
const qr={kind:'slip',sendingBank:'004',transactionRef:ref} as const;
describe('Deterministic slip policies',()=>{
  it('accepts only fully corroborated evidence and uses inclusive dates',()=>{
    expect(evaluate(base,vision,qr,false)).toMatchObject({verdict:'verified',autoAcceptable:true,amountMinor:149000,receiverLast4:'5678'});
    expect(evaluate(base,vision,emptyQr('absent'),false)).toMatchObject({verdict:'verified',autoAcceptable:false,needsStaffReason:'no_qr'});
    expect(evaluate(base,{...vision,legibility:.8},qr,false)).toMatchObject({verdict:'verified',autoAcceptable:false,needsStaffReason:'low_confidence'});
    expect(evaluate(base,{...vision,receiver_account_masked:null},qr,false)).toMatchObject({verdict:'verified',autoAcceptable:false,needsStaffReason:'receiver_name_only'});
  });
  it('evaluates tamper, duplicate, receiver, amount and time in priority order',()=>{
    const classify=(patch:Partial<Vision>)=>evaluate(base,{...vision,...patch},qr,false);
    expect(classify({is_transfer_slip:false}).verdict).toBe('unreadable');
    expect(classify({legibility:.4}).needsStaffReason).toBe('illegible');
    expect(classify({amount_text:'bad'}).needsStaffReason).toBe('amount_unreadable');
    expect(classify({transaction_ref:'OTHERREFERENCE'}).needsStaffReason).toBe('ref_mismatch');
    expect(classify({tamper_suspected:true}).verdict).toBe('suspected_forgery');
    expect(evaluate(base,vision,emptyQr('crc_bad'),false).needsStaffReason).toBe('qr_crc');
    expect(evaluate(base,vision,qr,true).verdict).toBe('duplicate');
    expect(classify({receiver_account_masked:'xxx-xxx-9999'}).verdict).toBe('wrong_account');
    expect(classify({amount_text:'1490.01'}).verdict).toBe('wrong_amount');
    expect(classify({transferred_at_iso:new Date(+now-1000).toISOString()}).verdict).toBe('wrong_date');
    expect(classify({transferred_at_iso:null}).needsStaffReason).toBe('no_time');
    expect(classify({receiver_account_masked:null,receiver_name:null}).needsStaffReason).toBe('receiver_unclear');
  });
});
describe('F14 analyzer contract',()=>{
  it('protects tenant files, honors dry runs, atomically claims references and handles model budget',async()=>{
    const origMode=config.SLIP_VERIFY_MODE;
    config.SLIP_VERIFY_MODE='vision';
    const bytes=await sharp({create:{width:48,height:48,channels:3,background:'white'}}).png().toBuffer();
    const file=await storage.save({businessId:base.businessId,uploadedBy:null,purpose:'slip-test',originalName:'test.png',mimeType:'image/png',bytes});
    const input={...base,fileId:file.id};
    const spy=vi.spyOn(visionApi,'readVision').mockResolvedValue(vision);
    try{
      await expect(analyzeSlip({...input,businessId:SEED.businesses[1].id})).rejects.toMatchObject({code:'NOT_FOUND'});
      expect(await analyzeSlip(input)).toMatchObject({verdict:'verified',autoAcceptable:false});
      expect(await db.maybeOne('SELECT ref_key FROM slip_refs WHERE business_id=$1 AND ref_key=$2',[base.businessId,ref])).toBeNull();
      const replies=await Promise.all([analyzeSlip({...input,dryRun:false}),analyzeSlip({...input,dryRun:false})]);
      expect(replies.map(r=>r.verdict).sort()).toEqual(['duplicate','verified']);
      expect((await analyzeSlip(input)).verdict).toBe('duplicate');
      spy.mockRejectedValueOnce(new AppError('PROVIDER_BUDGET_EXHAUSTED','Budget'));
      expect(await analyzeSlip(input)).toMatchObject({verdict:'technical',needsStaffReason:'provider_budget'});
      spy.mockResolvedValueOnce(null);
      expect(await analyzeSlip(input)).toMatchObject({verdict:'technical',needsStaffReason:'vision_failed'});
    } finally {spy.mockRestore();config.SLIP_VERIFY_MODE=origMode;}
  },45000);
  it('validates vision JSON and labels every simulator outcome',async()=>{
    const origMode=config.SLIP_VERIFY_MODE;
    const bytes=await sharp({create:{width:40,height:40,channels:3,background:'white'}}).png().toBuffer();
    const file=await storage.save({businessId:base.businessId,uploadedBy:null,purpose:'slip-test',originalName:'test.png',mimeType:'image/png',bytes});
    const input={...base,fileId:file.id};
    try {
      config.SLIP_VERIFY_MODE='vision';
      expect(await analyzeSlip(input)).toMatchObject({verdict:'technical',needsStaffReason:'vision_failed'});
      config.SLIP_VERIFY_MODE='sandbox';
      const spy=vi.spyOn(model,'chat');
      try {
        for(const outcome of ['verified','wrong_amount','wrong_account','wrong_date','duplicate','unreadable','suspected_forgery','timeout'] as const)
          expect(await analyzeSlip({...input,sandboxOutcome:outcome})).toMatchObject({mode:'sandbox',verdict:outcome==='timeout'?'technical':outcome,autoAcceptable:outcome==='verified'});
        expect(spy).not.toHaveBeenCalled();
      } finally {spy.mockRestore();}
    } finally {config.SLIP_VERIFY_MODE=origMode;}
  },45000);
});
afterAll(closeDb);

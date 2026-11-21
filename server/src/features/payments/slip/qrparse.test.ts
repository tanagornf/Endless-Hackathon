import {describe,expect,it} from 'vitest';
import {parseSlipQr,makeSlipQrPayload} from './qrparse';
import {amountMinor} from './pipeline';
import {matchReceiver} from './receiver';
import {decodeQr} from './decode';
import {renderSyntheticSlip} from './fixtures';
import sharp from 'sharp';
const reference='202611201234ABCD5678';
describe('Thai transfer slip QR',()=>{
  it.each([['0041000600000101030140220202611201234ABCD56785102TH9104946D','014',reference],
    ['0046000600000101030040225202611201234567890ABCDEFG5102TH91047FA7','004','202611201234567890ABCDEFG']])('reads the published vector %s',(encoded,bank,ref)=>{
    expect(parseSlipQr(encoded)).toEqual({kind:'slip',sendingBank:bank,transactionRef:ref});
    expect(makeSlipQrPayload(ref,bank)).toBe(encoded);
  });
  it('distinguishes payment QRs, CRC, malformed lengths and non-bank data',()=>{
    const good=makeSlipQrPayload(reference);
    expect(parseSlipQr(good.slice(0,-1)+'Z').kind).toBe('other');
    expect(parseSlipQr(good.slice(0,-1)+(good.endsWith('0')?'1':'0')).kind).toBe('crc_bad');
    expect(parseSlipQr(good.slice(2)).kind).toBe('other');
    expect(parseSlipQr('000201010212').kind).toBe('payment_qr');
  });
  it('reads a synthetic slip and a compressed lower crop',async()=>{
    const png=await renderSyntheticSlip({amountMinor:149000,transferredAt:new Date().toISOString(),receiverName:'Demo shop',receiverMasked:'xxx-xxx-5678',transactionRef:reference,withQr:true});
    const crop=await sharp(png).extract({left:0,top:660,width:720,height:620}).jpeg({quality:50}).toBuffer();
    for(const bytes of [png,crop]) expect(await decodeQr(bytes)).toMatchObject({kind:'slip',transactionRef:reference});
  },15000);
});
describe('amount and receiver evidence',()=>{
  it.each([['1,490.00',149000],['๑,๔๙๐.๐๐',149000],['฿1490',149000],['1490.505',null],['1,49.00',null]])('parses %s exactly',(raw,expected)=>expect(amountMinor(String(raw))).toBe(expected));
  it('compares ordered visible digits and never treats a name as strong',()=>{
    for(const mask of ['xxx-xxx-5678','081-xxx-5678','+66812345678']) expect(matchReceiver('0812345678','Demo',mask,'Other')).toMatchObject({pass:true,strong:true});
    expect(matchReceiver('0812345678','Demo','xxx-xxx-9999','Demo').pass).toBe(false);
    expect(matchReceiver(null,'Demo Boardgame Shop',null,'DEMO BOARDGAME SHOP')).toMatchObject({pass:true,strong:false});
    expect(matchReceiver(null,'สมชาย',null,'วิภา').pass).toBe(false);
  });
});

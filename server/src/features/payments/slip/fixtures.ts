import QRCode from 'qrcode';
import sharp from 'sharp';
import type { SyntheticSlipSpec } from '@nless/shared/features/payments/types';
import { AppError } from '../../../core';
import { makeSlipQrPayload } from './qrparse';

const font='Leelawadee UI, Tahoma, Noto Sans Thai, Sarabun, DejaVu Sans, sans-serif';
function escape(value:string) {
  return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
}
function label(y:number,text:string,size=29,color='#263343',x=44) {
  return '<text x="'+x+'" y="'+y+'" font-family="'+font+'" font-size="'+size+'" fill="'+color+'">'+escape(text)+'</text>';
}
const svg=(width:number,height:number,body:string)=>Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'"><rect width="100%" height="100%" fill="white"/>'+body+'</svg>');
export async function slipRenderingAvailable() {
  try {
    const glyph=async(text:string)=>sharp(svg(140,80,label(53,text,38,'#000',5))).greyscale().raw().toBuffer();
    const [a,b]=await Promise.all([glyph('ก'),glyph('ฮ')]);
    return a.some(pixel=>pixel<128) && !a.equals(b);
  } catch {return false;}
}
export async function renderSyntheticSlip(spec:SyntheticSlipSpec):Promise<Uint8Array> {
  const time=new Date(spec.transferredAt);
  if(!Number.isSafeInteger(spec.amountMinor) || spec.amountMinor<0 || !Number.isFinite(time.getTime())) throw new AppError('VALIDATION_ERROR','Invalid synthetic slip');
  const money=(minor:number)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}).format(minor/100)+' บาท';
  const stamp=new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(time);
  let body='<rect width="720" height="155" fill="#274169"/>'+label(63,spec.notASlip?'ใบเสร็จรับเงิน':'โอนเงินสำเร็จ',43,'#fff')+label(123,'ตัวอย่าง (ข้อมูลทดสอบ) • DEMO',27,'#fff');
  if(spec.notASlip) body+=label(300,'สินค้าในร้านตัวอย่าง')+label(365,money(spec.amountMinor));
  else {
    body+=label(205,'จำนวนเงิน',23)+label(266,money(spec.amountMinor),40)+label(355,'วันที่ทำรายการ',23)+label(400,stamp)+
      label(490,'จาก',23)+label(535,'นาย ทดสอบ ระบบ (DEMO BANK)')+label(605,'ไปยัง',23)+label(647,spec.receiverName)+label(692,spec.receiverMasked)+
      label(1098,'เลขที่รายการ',23)+label(1142,spec.transactionRef,27);
    if(spec.patchAmountMinor!==undefined) body+='<rect x="42" y="215" width="500" height="69" fill="#eee"/><g font-style="italic">'+label(264,money(spec.patchAmountMinor),44)+'</g>';
  }
  body+=label(1230,'ตัวอย่าง • SYNTHETIC TEST DATA',23,'#69778b');
  const base=sharp(svg(720,1280,body));
  if(spec.withQr && !spec.notASlip) {
    const qr=await QRCode.toBuffer(spec.qrPayload??makeSlipQrPayload(spec.transactionRef,spec.sendingBank),{width:260,margin:2,errorCorrectionLevel:'M'});
    base.composite([{input:qr,left:230,top:760}]);
  }
  const png=await base.png().toBuffer();
  if(!spec.blur) return png;
  const tiny=await sharp(png).resize(144).blur(1.2).png().toBuffer();
  return sharp(tiny).resize(720).blur(6).png().toBuffer();
}

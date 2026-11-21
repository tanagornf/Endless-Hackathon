import sharp, {type Region} from 'sharp';
import jsQR from 'jsqr';
import { emptyQr, parseSlipQr } from './qrparse';

export async function decodeQr(bytes: Uint8Array) {
  const {data: oriented,info}=await sharp(bytes,{limitInputPixels:36_000_000}).rotate()
    .resize({width:2400,height:2400,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
  const {width:w,height:h}=info;
  const region=(x:number,y:number,width:number,height:number):Region=>({left:Math.floor(w*x),top:Math.floor(h*y),
    width:Math.max(1,Math.floor(w*width)),height:Math.max(1,Math.floor(h*height))});
  const bottom=region(0,.5,1,.5);
  const attempts:{crop?:Region;side?:number;contrast?:boolean}[]=[{},{side:1200},{crop:bottom,side:1600},
    {crop:region(0,0,1,.5),side:1600},{crop:region(0,0,.5,1),side:1600},{crop:region(.5,0,.5,1),side:1600},
    {crop:region(.2,.2,.6,.6),side:1600},{contrast:true},{crop:bottom,contrast:true}];
  for(const y of [0,.3,.6]) for(const x of [0,.3,.6]) attempts.push({crop:region(x,y,.4,.4),side:1200});
  let last=emptyQr('absent');
  const start=performance.now();
  for(const attempt of attempts.slice(0,14)) {
    if(performance.now()-start>1500) break;
    let image=sharp(oriented);
    if(attempt.crop) image=image.extract(attempt.crop);
    if(attempt.side) image=image.resize({width:attempt.side,height:attempt.side,fit:'inside'});
    if(attempt.contrast) image=image.grayscale().normalise().threshold(140);
    const {data,info:size}=await image.toColourspace('srgb').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
    if (size.channels !== 4) {
      const pixels = size.width * size.height;
      rgba = new Uint8ClampedArray(pixels * 4);
      for (let i = 0; i < pixels; i++) {
        const offset = i * size.channels;
        rgba[i * 4] = data[offset];
        rgba[i * 4 + 1] = size.channels === 3 ? data[offset + 1] : data[offset];
        rgba[i * 4 + 2] = size.channels === 3 ? data[offset + 2] : data[offset];
        rgba[i * 4 + 3] = size.channels === 2 ? data[offset + 1] : 255;
      }
    }
    const decoded = jsQR(rgba, size.width, size.height, { inversionAttempts: 'attemptBoth' });
    if(!decoded) continue;
    const parsed=parseSlipQr(decoded.data);
    if(parsed.kind==='slip' || parsed.kind==='crc_bad') return parsed;
    if(last.kind==='absent' || parsed.kind==='payment_qr') last=parsed;
  }
  return last;
}

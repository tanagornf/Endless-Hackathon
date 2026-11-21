function name(value:string) {
  return value.normalize('NFKC').toLowerCase().replace(/^(?:นางสาว|นาง|นาย|น\.ส\.|นส\.|บจก\.|หจก\.|บริษัท|ร้าน|mrs\.?|mr\.?|ms\.?)\s*/u,'')
    .replace(/(?:จำกัด|\bco\.?|\bltd\.?)$/u,'').replace(/[^\p{L}\p{M}\p{N}\s]/gu,'').trim().split(/\s+/u).filter(word=>word.length>=2);
}
export function matchReceiver(expectedId:string|null,expectedName:string|null,masked:string|null,seenName:string|null) {
  const expected=expectedId?.replace(/\D/g,'')??'';
  let seen=(masked??'').normalize('NFKC').replace(/[ .-]/g,'').replace(/[xX*•●]/g,'?');
  if (/^\+?66[\d?]{9}$/.test(seen)) seen=seen.replace(/^\+?66/,'0');
  const groups=seen.match(/\d+/g)??[];
  const visible=groups.join('').length;
  if(expected && visible>=3 && /^[\d?]+$/.test(seen)) {
    let match=true;
    if(seen.length===expected.length) match=[...seen].every((c,i)=>c==='?' || c===expected[i]);
    else {
      let offset=0;
      for(const group of groups) {
        const pos=expected.indexOf(group,offset);
        if(pos<0) {match=false;break;}
        offset=pos+group.length;
      }
    }
    return {pass:match,strong:match,detail:match?'digits match ('+visible+' visible)':'digits differ'};
  }
  const wanted=name(expectedName??'');
  const actual=name(seenName??'');
  if(!wanted.length||!actual.length) return {pass:null,strong:false,detail:'insufficient receiver evidence'};
  let tokens=wanted;
  let matches:number;
  if(wanted.length===1 && /[ก-๙]/u.test(wanted[0]) && wanted[0].length>=3) {
    tokens=Array.from({length:wanted[0].length-2},(_,i)=>wanted[0].slice(i,i+3));
    matches=tokens.filter(token=>actual.join('').includes(token)).length;
  } else matches=tokens.filter(token=>actual.some(other=>other.startsWith(token.slice(0,2)))).length;
  const pass=matches/tokens.length>=.67;
  return {pass,strong:false,detail:pass?'name only':'name differs'};
}

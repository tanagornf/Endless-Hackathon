import { AppError } from '../../../core';
import { crc16ccitt } from '../crc16';

export const normalizeRef = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');
function tlv(tag: string, value: string) {
  return tag + String(value.length).padStart(2, '0') + value;
}
export function makeSlipQrPayload(reference: string, sendingBank = '004') {
  if (!/^[A-Za-z0-9]{10,35}$/.test(reference) || !/^\d{3}$/.test(sendingBank))
    throw new AppError('VALIDATION_ERROR', 'Invalid synthetic slip reference');
  const body = tlv('00', tlv('00', '000001') + tlv('01', sendingBank) + tlv('02', reference)) + tlv('51', 'TH') + '9104';
  return body + crc16ccitt(body);
}
function fields(text: string): Map<string,string> | null {
  const result = new Map<string,string>();
  let index = 0;
  while (index < text.length) {
    const head = text.slice(index, index + 4);
    if (!/^\d{4}$/.test(head)) return null;
    const tag = head.slice(0, 2);
    const end = index + 4 + Number(head.slice(2));
    if (end > text.length || result.has(tag)) return null;
    result.set(tag,text.slice(index + 4,end));
    index = end;
  }
  return result;
}
export type ParsedQr = { kind:'slip'|'crc_bad'|'payment_qr'|'other'|'absent'; sendingBank:string|null; transactionRef:string|null };
export const emptyQr = (kind: ParsedQr['kind']): ParsedQr => ({kind,sendingBank:null,transactionRef:null});
export function parseSlipQr(text: string): ParsedQr {
  if (text.startsWith('000201')) return emptyQr('payment_qr');
  if (text.length > 4096) return emptyQr('other');
  const outer=fields(text);
  const inner=fields(outer?.get('00')??'');
  const bank=inner?.get('01')??'';
  const reference=inner?.get('02')??'';
  if (inner?.get('00')!=='000001' || !/^\d{3}$/.test(bank) || !/^[A-Za-z0-9]{10,35}$/.test(reference)
    || (outer?.has('51') && outer.get('51')!=='TH') || !/9104[\dA-Fa-f]{4}$/.test(text))
    return emptyQr('other');
  if (crc16ccitt(text.slice(0,-4))!==text.slice(-4).toUpperCase()) return emptyQr('crc_bad');
  return {kind:'slip',sendingBank:bank,transactionRef:normalizeRef(reference)};
}

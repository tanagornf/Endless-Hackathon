import { AppError } from '../../core';
import { crc16ccitt } from './crc16';

export type PromptPayKind = 'mobile' | 'national_id' | 'ewallet';

function invalid(field: string): never {
  throw new AppError('VALIDATION_ERROR', 'Invalid payment QR input', { details: { field } });
}

export function normalizePromptPayId(kind: PromptPayKind, value: string): string {
  if (typeof value !== 'string') invalid('promptpayId');
  const id = value.replace(/[\s().-]/g, '');
  if (kind === 'mobile' && /^0[689]\d{8}$/.test(id)) return id;
  if (kind === 'ewallet' && /^\d{15}$/.test(id)) return id;
  if (kind === 'national_id' && /^\d{13}$/.test(id)) {
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
    if ((11 - sum % 11) % 10 === Number(id[12])) return id;
  }
  return invalid('promptpayId');
}

function tlv(tag: string, asciiValue: string): string {
  return tag + String(asciiValue.length).padStart(2, '0') + asciiValue;
}

export function buildPromptPayPayload(input: {
  kind: PromptPayKind;
  id: string;
  amountMinor: number | null;
  reference?: string | null;
  legacyTagOrder?: boolean;
}): string {
  const { kind, amountMinor, reference } = input;
  const id = normalizePromptPayId(kind, input.id);
  let amount = '';
  if (amountMinor !== null) {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 1 || amountMinor > 9_999_999_999) invalid('amountMinor');
    const satang = String(amountMinor % 100).padStart(2, '0');
    amount = tlv('54', Math.floor(amountMinor / 100) + '.' + satang);
  }

  const receiverTags = { mobile: '01', national_id: '02', ewallet: '03' } as const;
  const receiver = tlv(receiverTags[kind], kind === 'mobile' ? '0066' + id.slice(1) : id);
  const merchant = tlv('29', tlv('00', 'A000000677010111') + receiver);
  const currencyAmount = tlv('53', '764') + amount;
  const country = tlv('58', 'TH');
  let payload = tlv('00', '01') + tlv('01', amountMinor === null ? '11' : '12') + merchant;
  payload += input.legacyTagOrder ? country + currencyAmount : currencyAmount + country;
  if (reference != null) {
    if (typeof reference !== 'string' || !/^[A-Z0-9]{1,25}$/.test(reference)) invalid('reference');
    payload += tlv('62', tlv('05', reference));
  }
  payload += '6304';
  return payload + crc16ccitt(payload);
}

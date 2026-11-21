import { expect, it } from 'vitest';
import generatePayload from 'promptpay-qr';
import { crc16ccitt } from './crc16';

it.each([
  ['', 'FFFF'],
  ['123456789', '29B1'],
  ['A', 'B915'],
])('computes the CRC-16/CCITT-FALSE vector %j', (input, checksum) => {
  expect(crc16ccitt(input)).toBe(checksum);
});

it('matches the checksum on an independently generated payment payload', () => {
  const reference = generatePayload('0812345678', { amount: 1490 });
  expect(crc16ccitt(reference.slice(0, -4))).toBe(reference.slice(-4));
});

import { expect, it } from 'vitest';
import generatePayload from 'promptpay-qr';
import { buildPromptPayPayload, normalizePromptPayId } from './promptpay';
import type { PromptPayKind } from './promptpay';

const mobile = { kind: 'mobile', id: '0812345678' } as const;
type Vector = [PromptPayKind, string, number | null, string | null, string];
const vectors: Vector[] = [
  ['mobile', mobile.id, 149000, null, '00020101021229370016A00000067701011101130066812345678530376454071490.005802TH6304D906'],
  ['mobile', mobile.id, 298000, 'NL20NOV26KXPQMTRA', '00020101021229370016A00000067701011101130066812345678530376454072980.005802TH62210517NL20NOV26KXPQMTRA630476EA'],
  ['mobile', mobile.id, 5, null, '00020101021229370016A00000067701011101130066812345678530376454040.055802TH6304F1A0'],
  ['mobile', mobile.id, null, null, '00020101021129370016A0000006770101110113006681234567853037645802TH6304823E'],
  ['national_id', '1234567890121', 29800, null, '00020101021229370016A0000006770101110213123456789012153037645406298.005802TH63043213'],
  ['ewallet', '004999999999999', 100, null, '00020101021229390016A0000006770101110315004999999999999530376454041.005802TH6304B13D'],
];

it.each(vectors)('matches the F14 %s payload for %s, amount %s', (kind, id, amountMinor, reference, expected) => {
  expect(buildPromptPayPayload({ kind, id, amountMinor, reference })).toBe(expected);
});

it.each(vectors.filter(vector => vector[3] === null))('matches promptpay-qr in legacy tag order for %s/%s/%s', (kind, id, amountMinor) => {
  const expected = generatePayload(id, amountMinor === null ? {} : { amount: amountMinor / 100 });
  expect(buildPromptPayPayload({ kind, id, amountMinor, legacyTagOrder: true })).toBe(expected);
});

it('normalizes receiver formatting and preserves significant leading zeros', () => {
  expect(normalizePromptPayId('mobile', '(081) 234-56.78')).toBe(mobile.id);
  expect(normalizePromptPayId('national_id', '1-2345-67890-12-1')).toBe('1234567890121');
  expect(normalizePromptPayId('ewallet', '004 999999999999')).toBe('004999999999999');
});

it.each<[PromptPayKind, string]>([
  ['mobile', '0712345678'], ['mobile', '081234567'], ['mobile', '08a12345678'],
  ['national_id', '1234567890123'], ['ewallet', '00499999999999'],
])('rejects an invalid %s receiver', (kind, id) => {
  expect(() => buildPromptPayPayload({ kind, id, amountMinor: 1 })).toThrow(expect.objectContaining({
    code: 'VALIDATION_ERROR', details: { field: 'promptpayId' },
  }));
});

it.each([0, -1, 1.5, 10_000_000_000, NaN, Infinity])('rejects an invalid amount in satang', amountMinor => {
  expect(() => buildPromptPayPayload({ ...mobile, amountMinor })).toThrow(expect.objectContaining({
    code: 'VALIDATION_ERROR', details: { field: 'amountMinor' },
  }));
});

it('accepts the amount and reference boundaries with correct TLV lengths', () => {
  expect(buildPromptPayPayload({ ...mobile, amountMinor: 1 })).toContain('54040.01');
  const reference = 'A'.repeat(25);
  expect(buildPromptPayPayload({ ...mobile, amountMinor: 9_999_999_999, reference }))
    .toContain('541199999999.995802TH62290525' + reference + '6304');
});

it.each(['', 'lowercase', 'A-B', 'A'.repeat(26), 'ไทย'])('rejects a malformed reference', reference => {
  expect(() => buildPromptPayPayload({ ...mobile, amountMinor: 5, reference })).toThrow(expect.objectContaining({
    code: 'VALIDATION_ERROR', details: { field: 'reference' },
  }));
});

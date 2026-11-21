import { describe, expect, it } from 'vitest';
import { moneyContextMatches, moneyInWords, moneyMentions } from './money';

describe('F10 monetary evidence', () => {
  it.each([
    ['1,490 บาท', 149000], ['฿1490', 149000], ['๑,๔๙๐ บาท', 149000], ['1490.50 บาท', 149050],
    ['1.5k บาท', 150000], ['2 พัน บาท', 200000], ['ราคา 1490', 149000], ['1,490 baht', 149000],
    ['Shipping costs ฿100.00.', 10000], ['It costs 1490.', 149000],
  ])('extracts %s as integer satang', (text, expected) => {
    expect(moneyMentions(text).map(({ minor }) => minor)).toEqual([expected]);
  });

  it.each(['รวม 2 กล่อง', 'รวม 12 กล่อง', 'A-GAME-01', '10:00', '22/11/2026', '0812345678', 'ภายใน 7 วัน'])
    ('does not confuse %s with an amount', (text) => expect(moneyMentions(text)).toEqual([]));

  it('recognizes spelled-out monetary claims but keeps quantities out', () => {
    expect(moneyInWords.test('หนึ่งพันสี่ร้อยบาท')).toBe(true);
    expect(moneyInWords.test('one hundred baht')).toBe(true);
    expect(moneyInWords.test('one box')).toBe(false);
  });

  it('does not reuse a shipping fee as a discount in either language', () => {
    const source = 'ค่าส่ง 100 บาท';
    const [fee] = moneyMentions(source);
    const price = (reply: string, language: 'th' | 'en', customer = new Set<number>()) =>
      moneyContextMatches(moneyMentions(reply)[0], fee, source, language, customer);
    expect(price('ค่าส่ง 100 บาทค่ะ', 'th')).toBe(true);
    expect(price('ลดเหลือ 100 บาท', 'th')).toBe(false);
    expect(price('Shipping is 100 baht.', 'en')).toBe(true);
    expect(price('I can reduce it to 100 baht.', 'en')).toBe(false);
    expect(price('Yes, 100 baht.', 'en', new Set([10000]))).toBe(false);
  });
});

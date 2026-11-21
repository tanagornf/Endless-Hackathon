import { describe, expect, it } from 'vitest';
import { detectReplyLanguage, fallbacks } from './fallbacks';
import { maskCardNumbers } from './mask';

describe('F10 reply language', () => {
  it.each([
    ['A-GAME-01 ราคาเท่าไหร่', 'th'], ['How much is A-GAME-01?', 'en'],
    ['สนใจ board game ตัวนี้ค่ะ', 'th'], ['Hi, do you have การ์ด?', 'en'], ['👍', 'th'],
  ])('chooses a language for %s', (text, expected) => {
    expect(detectReplyLanguage([text], [], 'th')).toBe(expected);
  });

  it('uses the prior conversation before the shop default for an ambiguous message', () => {
    expect(detectReplyLanguage(['ok'], ['Hi, a question about a board game.'], 'th')).toBe('en');
  });

  it('has both localized forms for every fallback', () => {
    for (const { th, en } of Object.values(fallbacks)) {
      expect(th).toMatch(/\p{Script=Thai}/u);
      expect(en).toBeTruthy();
      expect(en).not.toMatch(/\p{Script=Thai}/u);
    }
  });
});

describe('F10 customer text masking', () => {
  it.each(['4111 1111 1111 1111', '4111-1111-1111-1111', '๔๑๑๑๑๑๑๑๑๑๑๑๑๑๑๑'])('masks the card number %s', (text) => {
    expect(maskCardNumbers(text)).toBe('[บัตร •••• 1111]');
  });

  it('keeps short reference and contact numbers', () => {
    expect(maskCardNumbers('0812345678 123456789012')).toBe('0812345678 123456789012');
  });
});

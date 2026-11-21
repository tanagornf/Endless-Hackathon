import { describe, expect, test } from 'vitest';
import { detectTextLanguage, formatMoneyText } from './language';

describe('detectTextLanguage', () => {
  test.each([
    ['A-GAME-01 ราคาเท่าไหร่', 'th'],
    ['How much is A-GAME-01?', 'en'],
    ['สนใจ board game ตัวนี้ค่ะ', 'th'],
    ['Hi, do you have การ์ด?', 'en'],
    ['ok', null],
    ['2', null],
    ['👍', null],
    ['https://example.test/item hello@example.test A-GAME-01', null],
  ])('detects the language of %s', (text, expected) => {
    expect(detectTextLanguage(text!)).toBe(expected);
  });
});

describe('formatMoneyText', () => {
  test.each([
    [149000, 'th', '1,490 บาท'],
    [149000, 'en', '1,490 baht'],
    [9950, 'en', '99.50 baht'],
  ] as const)('formats %d in %s', (minor, language, expected) => {
    expect(formatMoneyText(minor, language)).toBe(expected);
  });
});

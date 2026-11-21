export type CustomerLanguage = 'th' | 'en';

/**
 * @owner F01 core · C1 · consumers: B2 F10/F38, A1 F09 (getCustomerLanguage), every lane's tests
 * Language of ONE piece of customer text, by counting letters after removing URLs, e-mail addresses, SKU-like tokens
 * (letters+digits joined by '-', e.g. A-GAME-01) and digits: thai = \p{Script=Thai} letters, latin = [A-Za-z].
 * thai > 0 && thai >= latin → 'th' · latin >= 3 && latin > thai → 'en' · otherwise null (no letters: '2', '👍', 'ok').
 * Examples: 'A-GAME-01 ราคาเท่าไหร่' → 'th' · 'How much is A-GAME-01?' → 'en' · 'สนใจ board game ตัวนี้ค่ะ' → 'th' ·
 * 'Hi, do you have การ์ด?' → 'en' · 'ok' → null.
 * @fake real (pure function, shipped at setup).
 */
export function detectTextLanguage(text: string): CustomerLanguage | null {
  const clean = text.replace(/https?:\/\/[^\s]+|\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b(?=[\w-]*\d)[a-z\d]+(?:-[a-z\d]+)+\b/giu, ' ');
  const thai = [...clean].filter((letter) => /\p{Letter}/u.test(letter) && /\p{Script=Thai}/u.test(letter)).length;
  const latin = clean.match(/[A-Za-z]/g)?.length ?? 0;
  if (thai > 0 && thai >= latin) return 'th';
  return latin >= 3 && latin > thai ? 'en' : null;
}


/**
 * @owner F01 core · C1. Customer-facing money text from integer satang: formatMoneyText(149000, 'th') → '1,490 บาท',
 * (149000, 'en') → '1,490 baht', (9950, 'en') → '99.50 baht' (decimals only when minor % 100 !== 0). Server-side
 * messages, receipts, card altText and AI tool results use this; web pages keep WebCore.formatMoney.
 * @fake real (pure function, shipped at setup).
 */
export function formatMoneyText(minor: number, lang: CustomerLanguage): string {
  const decimalPlaces = minor % 100 === 0 ? 0 : 2;
  const amount = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(minor / 100);
  return amount + (lang === 'th' ? ' บาท' : ' baht');
}

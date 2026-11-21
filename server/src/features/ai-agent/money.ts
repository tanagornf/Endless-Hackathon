import { detectTextLanguage } from '@nless/shared/core/language';
import type { CustomerLanguage } from '@nless/shared/core/language';
import { arabicDigits } from './mask';

export const skuPattern = /\b(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9]{1,10}(?:-[A-Za-z0-9]{1,10}){1,3}\b/g;
const amountPattern = String.raw`(?<whole>\d{1,3}(?:,\d{3})+|\d+)(?<fraction>\.\d{1,2})?(?![\d,.]\d)(?!\d)`;
const suffixPattern = new RegExp(amountPattern + String.raw`\s*(?<multiplier>k|พัน|หมื่น|แสน|ล้าน)?\s*(?:บาท|baht\b|bath\b|thb\b|฿)`, 'giu');
const symbolPattern = new RegExp(String.raw`(?:฿|\bthb)\s*` + amountPattern, 'giu');
const prefixedPattern = new RegExp(
  String.raw`(?:ราคา|รวม|ยอด|ทั้งหมด|ส่วนลด|ลดเหลือ|ลดเป็น|เหลือ|ค่าส่ง|ชำระ|มัดจำ|\b(?:total|price|costs?|only)\b(?:\s+is)?)\s*[:=]?\s*` +
    amountPattern + String.raw`(?!\s*(?:วัน|ชิ้น|กล่อง|ชุด|คน|นาที|ชม|ชั่วโมง|%|เปอร์เซ็นต์|ครั้ง|ใบ|อัน|เกม|ที่|แถว|ปี|เดือน|สัปดาห์|โมง|(?:units?|pieces?|boxes?|sets?|days?|hours?|weeks?|months?|years?)\b))`,
  'giu',
);
const multipliers: Record<string, number> = { k: 1000, พัน: 1000, หมื่น: 10000, แสน: 100000, ล้าน: 1000000 };
export const moneyInWords = /(?:หนึ่ง|สอง|สาม|สี่|ห้า|หก|เจ็ด|แปด|เก้า|สิบ|ยี่สิบ|เอ็ด|ร้อย|พัน|หมื่น|แสน|ล้าน)+\s*บาท|\b(?:(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|and)[ -]+)+baht\b/iu;

export interface MoneyMention {
  minor: number;
  before: string;
}

export function moneyMentions(value: string): MoneyMention[] {
  const text = arabicDigits(value.normalize('NFKC')).replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\[บัตร •••• \d{4}\]/gi, ' ')
    .replace(skuPattern, ' ');
  const protectedText = text.replace(/\b\d{1,2}(?::|\.)\d{2}(?!\d|\s*(?:บาท|baht\b|thb\b|฿))|\b\d{1,2}\s*(?:โมง|น\.)|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|(?:\+66|\b0)[ -]?\d(?:[ -]?\d){7,9}\b|\b\d{6,}\b/g,
    (match) => ' '.repeat(match.length));
  const matches: { start: number; end: number; money: MoneyMention }[] = [];
  for (const [pattern, source] of [[suffixPattern, text], [symbolPattern, text], [prefixedPattern, protectedText]] as const) {
    for (const match of source.matchAll(pattern)) {
      const start = match.index!;
      const end = start + match[0].length;
      if (matches.some((previous) => start < previous.end && end > previous.start)) continue;
      const { whole, fraction, multiplier } = match.groups!;
      const minor = Math.round(Number(whole.replace(/,/g, '') + (fraction ?? '')) * (multipliers[multiplier?.toLowerCase()] ?? 1) * 100);
      const amountStart = start + match[0].indexOf(whole);
      matches.push({ start, end, money: { minor, before: text.slice(Math.max(0, amountStart - 30), amountStart) } });
    }
  }
  return matches.sort((left, right) => left.start - right.start).map((match) => match.money);
}

const discountContext = /discount|reduc|special|promo|only|just|sale|\boff\b|ลด|เหลือ|พิเศษ|โปร/i;

function comparable(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{M}]+/gu, '');
}

export function moneyContextMatches(
  reply: MoneyMention,
  source: MoneyMention,
  sourceText: string,
  language: CustomerLanguage,
  customerAmounts: ReadonlySet<number>,
): boolean {
  if (reply.minor !== source.minor) return false;
  if (detectTextLanguage(sourceText) !== language) {
    return !customerAmounts.has(reply.minor) && !discountContext.test(reply.before);
  }
  const key = comparable(source.before).slice(-8);
  const context = comparable(reply.before.slice(-20));
  for (let index = 0; index + 3 <= key.length; index += 1) {
    if (context.includes(key.slice(index, index + 3))) return true;
  }
  return false;
}

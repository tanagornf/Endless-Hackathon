const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const skuPattern = /[a-z][a-z0-9]*(?:[-_./][a-z0-9]+)+/g;
const stopWords = new Set(('ขอ ค่ะ คะ ครับ นะ ไหม มั้ย หรือ ที่ ได้ ไม่ มี เป็น อยู่ จะ ก็ แล้ว และ ของ ใน กับ ให้ ว่า นี้ นั้น ' +
  'อะไร ยังไง กี่ ด้วย หน่อย จ้า เท่า ไหร่ ไร ยัง ไง คน แถว the a an is are do does did you your i my me we our it its ' +
  'this that there to of in on at for from with and or be can could would will what how please').split(' '));

export function cleanText(value: string): string {
  return value.normalize('NFKC').replace(/\u0e4d\u0e32/g, '\u0e33').replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

export function normalize(value: string): string {
  return cleanText(value).toLowerCase().replace(/\s+/g, ' ');
}

export function wordSpans(value: string): Intl.SegmentData[] {
  return [...segmenter.segment(value)].filter((segment) => segment.isWordLike);
}

export function countTerms(value: string): number {
  return wordSpans(cleanText(value)).length;
}

export function termsOf(value: string): { words: string[]; skus: string[] } {
  const text = normalize(value);
  const skus = [...new Set(text.match(skuPattern) ?? [])];
  const words = wordSpans(text.replace(skuPattern, ' ')).map((span) => span.segment)
    .filter((term) => !stopWords.has(term) && (term.length >= 2 || /\d/.test(term)))
    .map((term) => /^[a-z]{4,}ed$/.test(term) ? term.slice(0, -2) : term);
  return { words: [...new Set(words)], skus };
}

function scriptCounts(value: string) {
  const text = normalize(value).replace(skuPattern, ' ');
  return { thai: (text.match(/\p{Script=Thai}/gu) ?? []).length, latin: (text.match(/[a-z]/g) ?? []).length };
}

export function scriptOf(value: string): 'th' | 'latin' {
  const { thai, latin } = scriptCounts(value);
  return thai > latin ? 'th' : 'latin';
}

export function mixedQuery(value: string): boolean {
  const { thai, latin } = scriptCounts(value);
  return thai >= 2 && latin >= 3;
}

export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const boundary = wordSpans(text).findLast((span) => span.index + span.segment.length <= max);
  if (boundary) return text.slice(0, boundary.index + boundary.segment.length).trimEnd();
  const cut = text.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

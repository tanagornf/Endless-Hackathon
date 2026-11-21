export const PRICE_MAX_MINOR = 10_000_000_000;

export function parsePriceToMinor(input: string | number): number | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0 || input > PRICE_MAX_MINOR / 100) return null;
    const minor = Math.round(input * 100);
    return Math.abs(minor / 100 - input) <= 1e-9 ? minor : null;
  }
  const normalized = input.normalize('NFKC')
    .replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50))
    .replace(/\s/g, '')
    .replace(/^(?:฿|THB|baht|บาท)/i, '')
    .replace(/(?:฿|THB|baht|บาท)$/i, '');
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [baht, satang = ''] = normalized.replaceAll(',', '').split('.');
  const minor = Number(baht) * 100 + Number(satang.padEnd(2, '0'));
  return Number.isSafeInteger(minor) && minor <= PRICE_MAX_MINOR ? minor : null;
}

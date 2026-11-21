import i18n from './i18n';

export function formatMoney(minor: number, currency: 'THB' = 'THB'): string {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}
export function formatDateTime(iso: string, opts?: { dateOnly?: boolean }): string {
  return new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'th-TH', {
    timeZone: 'Asia/Bangkok', dateStyle: 'medium', ...(opts?.dateOnly ? {} : { timeStyle: 'short' }),
  }).format(new Date(iso));
}

export const SKU_RE = /^[\p{L}\p{M}\p{N} ._\-/#]{1,64}$/u;

export function catalogKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function literalContains(value: string): string {
  return '%' + value.replace(/[!%_]/g, '!$&') + '%';
}

import type { DbExecutor } from '../../core';

export const SKU_RE = /^[\p{L}\p{M}\p{N} ._\-/#]{1,64}$/u;

export function catalogKey(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function literalContains(value: string): string {
  return '%' + value.replace(/[!%_]/g, '!$&') + '%';
}

export async function lockCatalogSkuWrites(tx: DbExecutor, businessId: string): Promise<void> {
  await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['catalog-sku:' + businessId]);
}

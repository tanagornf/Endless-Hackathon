import type { CatalogItem, ProductRef } from '@nless/shared/features/catalog/types';
import { resolveProduct } from './refs';
import { itemView } from './repo';

export { parsePriceToMinor } from '@nless/shared/features/catalog/money';
export { getPrice } from './price';
export { checkSku, getCatalogItemDetails, getHistory, getItemAdmin, listCatalogItems, listCategories, listItems } from './repo';
export { createItem, deleteItem, patchItem } from './items';
export { importCatalogItems } from './import';

export async function getProduct(businessId: string, ref: ProductRef): Promise<CatalogItem | null> {
  const row = await resolveProduct(businessId, ref);
  return row ? itemView(row) : null;
}

/** @owner F08 catalog · B1 · consumer: A2 F13 (decrement on order confirm, give back on cancel). OPTIONAL for A2: if never called, stock stays manual.
 *  One atomic UPDATE (stock = stock + delta, never below 0): result below 0 → AppError('SOLD_OUT'); stock null (not tracked) → no-op returning
 *  { stockAfter: null, applied: false }. variantId given → that variant's stock (variant stock null → falls back to the item stock).
 *  Bumps catalog_items.version (so open proposals re-check). Idempotent per (refType, refId, itemId, variantId): a repeat returns the first result with applied:false.
 *  Audit catalog.stock.adjust. Unknown / inactive-is-allowed (a cancelled order may return stock to an inactive item) / other tenant → NOT_FOUND.
 *  @fake { stockAfter: null, applied: false, version: 1 }. */
export async function adjustCatalogStock(input: {
  businessId: string; itemId: string; variantId?: string | null; delta: number;
  reason: 'order' | 'order_cancel' | 'correction'; refType: string; refId: string; actorUserId: string | null;
}): Promise<{ stockAfter: number | null; applied: boolean; version: number }> {
  return { stockAfter: null, applied: false, version: 1 };
}

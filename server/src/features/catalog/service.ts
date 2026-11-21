import { AppError } from '../../core';
import type { CatalogImportResult, CatalogImportRow, CatalogItem, ProductRef } from '@nless/shared/features/catalog/types';
import { resolveProduct } from './refs';
import { itemView } from './repo';

export { parsePriceToMinor } from '@nless/shared/features/catalog/money';
export { getPrice } from './price';
export { getCatalogItemDetails, listCatalogItems, listItems } from './repo';

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
  throw new AppError("SERVICE_NOT_READY", "adjustCatalogStock is not implemented");
}

/** @owner F08 catalog · B1 · consumer: B3 (F06 knowledge-import). Max 500 rows (more → VALIDATION_ERROR).
 *  New SKUs are created as DRAFTS: active = false, source 'import', sourceRef = importId — the shop reviews them in /catalog and turns them on.
 *  Existing SKU: mode 'create_only' (default) → skipped with error code 'sku_exists'; mode 'update_existing' → price / name / stock / unit / nameEn /
 *  description / category / shippable are updated in place (active flag untouched), version bumped, audit catalog.item.update + catalog.price.change.
 *  Validation is the same as POST /items. dryRun: validate and report only, writes nothing. onError 'abort' (default) = all or nothing;
 *  'skip_row' = apply valid rows, report the rest. One transaction. Audit catalog.import (counts only).
 *  @fake validates nothing, writes nothing: { applied: !dryRun, created: rows.length, updated: 0, skipped: 0, errors: [], items: fake ids }. */
export async function importCatalogItems(input: {
  businessId: string; actorUserId: string | null; importId: string; rows: CatalogImportRow[];
  mode?: 'create_only' | 'update_existing'; onError?: 'abort' | 'skip_row'; dryRun?: boolean;
}): Promise<CatalogImportResult> {
  throw new AppError("SERVICE_NOT_READY", "importCatalogItems is not implemented");
}

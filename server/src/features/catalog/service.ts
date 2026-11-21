import { AppError } from '../../core';
import { SEED } from '@nless/shared/core/fixtures';
const seedId = (alias: string) => SEED.businesses.find((business) => business.alias === alias)?.id;
import type { CatalogImportResult, CatalogImportRow, CatalogItem, CatalogItemDetail, PriceQuote, ProductRef } from '@nless/shared/features/catalog/types';
import type { Page } from '@nless/shared/core/types';

/**
 * @owner F08 catalog · B1 · consumers: B2 (tools, cards), A2 (orders, live codes)
 * Null when not found / inactive / other business (R3).
 * @fake SEED.catalog of that business.
 */
export async function getProduct(businessId: string, ref: ProductRef): Promise<CatalogItem | null> {
  const item = SEED.catalog.find((candidate) => seedId(candidate.businessAlias) === businessId && (
    'itemId' in ref ? candidate.id === ref.itemId :
    'sku' in ref ? candidate.sku.toLowerCase() === ref.sku.toLowerCase() :
    [candidate.name, candidate.nameEn].some((name) => name.toLowerCase() === ref.name.toLowerCase())
  ));
  return item ? { id: item.id, businessId, sku: item.sku, kind: item.kind, name: item.name, nameEn: item.nameEn,
    priceMinor: item.priceMinor, currency: item.currency, stock: item.stock, shippable: item.shippable,
    durationMinutes: item.durationMinutes, variants: [], active: true, version: item.version } : null;
}

/**
 * @owner F08 catalog · B1. Canonical price from the DB now. quantity default 1, must be a positive integer
 * → else VALIDATION_ERROR. Unknown item/variant → NOT_FOUND. Sold out (stock 0 or < quantity) → soldOut: true
 * (R4, not a throw). subtotalMinor = unit × quantity, integer math. Shipping is NOT included (F13 adds it).
 * @fake SEED.catalog: A-GAME-01 ×2 → subtotal 298000; A-SOLD-01 → soldOut true; services → available null.
 */
export async function getPrice(
  businessId: string,
  input: ProductRef & { variantId?: string | null; quantity?: number },
): Promise<PriceQuote> {
  const quantity = input.quantity ?? 1;
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new AppError('VALIDATION_ERROR', 'Quantity must be a positive integer');
  const item = await getProduct(businessId, input);
  if (!item || input.variantId) throw new AppError('NOT_FOUND', 'Product not found');
  return { itemId: item.id, variantId: null, sku: item.sku, name: item.name, unitPriceMinor: item.priceMinor,
    quantity, subtotalMinor: item.priceMinor * quantity, currency: 'THB', available: item.stock,
    soldOut: item.stock !== null && item.stock < quantity, version: item.version };
}

/** @owner F08 catalog · B1 · MANDATORY (agreed with B2 F10 list_products, C1 F39 ACP feed + MCP search_catalog, A2 F22)
 *  Customer-facing listing: ONLY active, not-deleted items of THIS business (never inactive, never another tenant).
 *  query   = every whitespace-separated word must match (case-insensitive, NFKC) name, nameEn, an item/variant SKU or category (substring).
 *  category = exact (case-insensitive) match. maxPriceMinor = item price <= max OR any active variant price <= max.
 *  inStockOnly = stock is null OR stock > 0 (services always pass). limit default 20, max 100 (> 100 → 100; < 1 or not an integer → VALIDATION_ERROR).
 *  Sorted by name (case-insensitive) then id. cursor is opaque (from a previous nextCursor); a malformed cursor → VALIDATION_ERROR.
 *  Items carry active variants only. No price visibility policy here: callers (F10) hide prices per answerPolicy.
 *  @fake filters SEED.catalog of that business by name / nameEn / sku substring, maxPriceMinor, inStockOnly (stock === null || stock > 0);
 *        category is ignored (SEED has none); sorted by name; cursor = String(offset); limit as above. */
export async function listCatalogItems(
  businessId: string,
  opts?: { query?: string; category?: string; maxPriceMinor?: number; inStockOnly?: boolean; limit?: number; cursor?: string },
): Promise<Page<CatalogItem>> {
  throw new AppError("SERVICE_NOT_READY", "listCatalogItems is not implemented");
}

/** @owner F08 catalog · B1 · consumers: C1 F39 (feed), A2 F22
 *  Active items only, unknown / other-tenant / inactive ids silently skipped. ≤ 100 ids (more → VALIDATION_ERROR). Order = input order.
 *  @fake SEED.catalog rows by id, description null, category null, unit 'ชิ้น', images []. */
export async function getCatalogItemDetails(businessId: string, itemIds: string[]): Promise<CatalogItemDetail[]> {
  throw new AppError("SERVICE_NOT_READY", "getCatalogItemDetails is not implemented");
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

/** Shared pure helper (shared/features/catalog/money.ts) for CSV / sheet text. Accepts Thai or Arabic digits, "฿", "บาท", "THB", spaces,
 *  thousands commas and at most 2 decimals: '1,490' → 149000 · '฿1,490.50' → 149050 · '๑๔๙๐ บาท' → 149000 · '12.5' → 1250.
 *  Returns null for empty, negative, > 100,000,000 baht, 3+ decimals, or anything else. A number input is treated as BAHT and must have ≤ 2 decimals. */
export function parsePriceToMinor(input: string | number): number | null {
  throw new AppError("SERVICE_NOT_READY", "parsePriceToMinor is not implemented");
}

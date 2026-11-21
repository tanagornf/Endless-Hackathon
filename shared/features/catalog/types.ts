export interface CatalogVariant {
  id: string;
  name: string;
  sku: string | null;
  /** null = same as item price. */
  priceMinor: number | null;
  stock: number | null;
}

export interface CatalogItem {
  id: string;
  businessId: string;
  sku: string;
  kind: 'product' | 'service';
  name: string;
  nameEn: string | null;
  priceMinor: number;
  currency: 'THB';
  /** null = not stock-tracked (services). */
  stock: number | null;
  shippable: boolean;
  durationMinutes: number | null;
  active: boolean;
  variants: CatalogVariant[];
  version: number;
}

/** Lookup by id, by SKU (exact, case-insensitive) or by name (exact match first, else the single item whose name/nameEn contains it; ambiguous → null). */
export type ProductRef = { itemId: string } | { sku: string } | { name: string };

export interface PriceQuote {
  itemId: string;
  variantId: string | null;
  sku: string;
  name: string;
  quantity: number;
  unitPriceMinor: number;
  subtotalMinor: number;
  currency: 'THB';
  available: number | null;
  soldOut: boolean;
  /** Catalog version the price came from; a proposal stores it and re-checks on confirm. */
  version: number;
}

/** Extra fields for feeds, cards and pricing pages. CatalogItem stays the lean contract type. */
export interface CatalogItemDetail extends CatalogItem {
  description: string | null;
  category: string | null;
  /** Sale unit label, e.g. 'ชิ้น', 'ชุด', 'ครั้ง'. */
  unit: string;
  /** In display order (first = primary). fileId = core `files.id`; the public URL is the consumer's job (F39 builds it from PUBLIC_BASE_URL). */
  images: { fileId: string; alt: string }[];
  variants: (CatalogVariant & { effectivePriceMinor: number; effectiveStock: number | null })[];
}

/** Draft rows from a CSV / sheet. Price is already integer satang (use parsePriceToMinor on text). */
export interface CatalogImportRow {
  rowNo: number;
  sku: string;
  kind?: 'product' | 'service';
  name: string;
  nameEn?: string | null;
  description?: string | null;
  category?: string | null;
  priceMinor: number;
  unit?: string;
  stock?: number | null;
  shippable?: boolean;
  durationMinutes?: number | null;
  variants?: { name: string; sku?: string | null; priceMinor?: number | null; stock?: number | null }[];
}

export interface CatalogImportError { rowNo: number; sku: string | null; code: 'sku_invalid' | 'sku_taken' | 'sku_duplicate_in_file' | 'name_required' | 'price_invalid' | 'stock_invalid' | 'duration_required' | 'variant_invalid' | 'variant_limit' | 'sku_exists'; message: string }

export interface CatalogImportResult {
  applied: boolean;                     // false when dryRun, or onError 'abort' with errors
  created: number; updated: number; skipped: number;
  errors: CatalogImportError[];
  items: { rowNo: number; sku: string; itemId: string | null; action: 'created' | 'updated' | 'skipped' | 'error' }[];
}

export interface CatalogItemRow {
  id: string;
  sku: string;
  kind: CatalogItem['kind'];
  name: string;
  nameEn: string | null;
  category: string | null;
  priceMinor: number;
  hasVariantPrices: boolean;
  minPriceMinor: number;
  unit: string;
  stock: number | null;
  active: boolean;
  version: number;
  imageUrl: string | null;
  variantCount: number;
  updatedAt: string;
}

export interface CatalogImage {
  id: string;
  fileId: string;
  position: number;
  alt: string;
  flagged: boolean;
  url: string;
}

export interface CatalogItemAdminDetail extends CatalogItem {
  description: string | null;
  category: string | null;
  unit: string;
  images: CatalogImage[];
  source: 'manual' | 'import' | 'seed';
  sourceRef: string | null;
  priceChangedAt: string;
  createdAt: string;
  updatedAt: string;
  variants: (CatalogVariant & { active: boolean; position: number; effectivePriceMinor: number; effectiveStock: number | null })[];
}

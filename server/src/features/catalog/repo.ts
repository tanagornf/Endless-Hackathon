import { z } from 'zod';
import { AppError, db } from '../../core';
import type { Page } from '@nless/shared/core/types';
import type {
  CatalogImage, CatalogItem, CatalogItemDetail, CatalogItemRow, CatalogVariant,
} from '@nless/shared/features/catalog/types';
import type { ListQuery } from './schema';
import { catalogKey, literalContains } from './sku';

interface VariantRow extends Omit<CatalogVariant, 'priceMinor'> {
  priceMinor: string | null;
  active: boolean;
  position: number;
}
type ImageRow = Omit<CatalogImage, 'url'>;
export interface ItemRow {
  id: string;
  business_id: string;
  sku: string;
  kind: CatalogItem['kind'];
  name: string;
  name_en: string | null;
  sort_name: string;
  description: string | null;
  category: string | null;
  unit: string;
  price_minor: string;
  currency: 'THB';
  stock: number | null;
  shippable: boolean;
  duration_minutes: number | null;
  active: boolean;
  version: number;
  source: 'manual' | 'import' | 'seed';
  source_ref: string | null;
  price_changed_at: Date;
  created_at: Date;
  updated_at: Date;
  variants: VariantRow[];
  images: ImageRow[];
}
export type ResolvedRow = ItemRow & { matched_variant_id: string | null; exact_name?: boolean };
export interface CatalogListOptions {
  query?: string;
  category?: string;
  maxPriceMinor?: number;
  inStockOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export const isItemId = (id: string) => z.string().uuid().safeParse(id).success;

const formatKey = (field: string) => "btrim(regexp_replace(lower(normalize(" + field + ", NFKC)), '[[:space:]]+', ' ', 'g'))";
export const nameKey = formatKey('i.name');
export const englishNameKey = formatKey('i.name_en');
const categoryKey = formatKey('i.category');

export const selectItems = 'SELECT i.*,lower(i.name) AS sort_name,' +
  "COALESCE((SELECT jsonb_agg(jsonb_build_object('id',v.id,'name',v.name,'sku',v.sku,'priceMinor',v.price_minor::text," +
  "'stock',v.stock,'active',v.active,'position',v.position) ORDER BY v.position,v.id) FROM catalog_variants v " +
  "WHERE v.business_id=i.business_id AND v.item_id=i.id),'[]'::jsonb) AS variants," +
  "COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'fileId',p.file_id,'position',p.position,'alt',p.alt,'flagged',p.flagged) " +
  "ORDER BY p.position,p.id) FROM catalog_item_images p WHERE p.business_id=i.business_id AND p.item_id=i.id),'[]'::jsonb) AS images";

export function minorAmount(value: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new AppError('INTERNAL', 'Invalid stored catalog price');
  return number;
}

export function variantView(row: VariantRow): CatalogVariant {
  return {
    id: row.id, name: row.name, sku: row.sku,
    priceMinor: row.priceMinor === null ? null : minorAmount(row.priceMinor), stock: row.stock,
  };
}

export function itemView(row: ItemRow): CatalogItem {
  return {
    id: row.id, businessId: row.business_id, sku: row.sku, kind: row.kind, name: row.name, nameEn: row.name_en,
    priceMinor: minorAmount(row.price_minor), currency: row.currency, stock: row.stock, shippable: row.shippable,
    durationMinutes: row.duration_minutes, active: row.active, variants: row.variants.filter((variant) => variant.active).map(variantView),
    version: row.version,
  };
}

function detailView(row: ItemRow): CatalogItemDetail {
  const item = itemView(row);
  return {
    ...item, description: row.description, category: row.category, unit: row.unit,
    images: row.images.map(({ fileId, alt }) => ({ fileId, alt })),
    variants: item.variants.map((variant) => ({
      ...variant, effectivePriceMinor: variant.priceMinor ?? item.priceMinor, effectiveStock: variant.stock ?? item.stock,
    })),
  };
}

const cursorSchema = z.object({ n: z.string().max(1000), id: z.string().uuid() }).strict();
function decodeCursor(value: string) {
  try {
    if (!/^[A-Za-z0-9_-]{1,2000}$/.test(value)) throw new Error();
    return cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid catalog cursor');
  }
}

interface ListFilters {
  status: ListQuery['status'];
  kind?: ListQuery['kind'];
  query?: string;
  category?: string;
  maxPriceMinor?: number;
  inStockOnly?: boolean;
  limit: number;
  cursor?: string;
}

async function listRows(businessId: string, filters: ListFilters): Promise<Page<ItemRow>> {
  const values: unknown[] = [businessId];
  const where = ['i.business_id=$1', 'i.deleted_at IS NULL'];
  const bind = (value: unknown) => '$' + values.push(value);
  if (filters.status !== 'all') where.push('i.active=' + bind(filters.status === 'active'));
  if (filters.kind) where.push('i.kind=' + bind(filters.kind));
  const query = catalogKey(filters.query ?? '');
  if (query) {
    const terms = bind(query.split(' ').map(literalContains));
    where.push('NOT EXISTS (SELECT 1 FROM unnest(' + terms + '::text[]) AS words(term) WHERE NOT (' +
      nameKey + " LIKE words.term ESCAPE '!' OR COALESCE(" + englishNameKey + ", '') LIKE words.term ESCAPE '!' OR COALESCE(" +
      categoryKey + ", '') LIKE words.term ESCAPE '!' OR EXISTS (" +
      'SELECT 1 FROM catalog_sku_registry r LEFT JOIN catalog_variants v ON v.business_id=r.business_id AND v.item_id=r.item_id AND v.id=r.variant_id ' +
      "WHERE r.business_id=i.business_id AND r.item_id=i.id AND r.sku_key LIKE words.term ESCAPE '!' AND (r.variant_id IS NULL OR v.active))))");
  }
  const category = catalogKey(filters.category ?? '');
  if (category) where.push(categoryKey + '=' + bind(category));
  if (filters.maxPriceMinor !== undefined) {
    const max = bind(filters.maxPriceMinor);
    where.push('(i.price_minor<=' + max + ' OR EXISTS (SELECT 1 FROM catalog_variants v WHERE v.business_id=i.business_id ' +
      'AND v.item_id=i.id AND v.active AND v.price_minor<=' + max + '))');
  }
  if (filters.inStockOnly) where.push('(i.stock IS NULL OR i.stock>0)');
  if (filters.cursor !== undefined) {
    const cursor = decodeCursor(filters.cursor);
    where.push('(lower(i.name),i.id) > (' + bind(cursor.n) + ',' + bind(cursor.id) + '::uuid)');
  }
  const { rows } = await db.query<ItemRow>(selectItems + ' FROM catalog_items i WHERE ' + where.join(' AND ') +
    ' ORDER BY lower(i.name),i.id LIMIT ' + bind(filters.limit + 1), values);
  const items = rows.slice(0, filters.limit);
  const last = items.at(-1);
  return {
    items, nextCursor: rows.length > filters.limit && last
      ? Buffer.from(JSON.stringify({ n: last.sort_name, id: last.id })).toString('base64url') : null,
  };
}

export async function listCatalogItems(businessId: string, opts?: CatalogListOptions): Promise<Page<CatalogItem>> {
  const limit = opts?.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || (opts?.maxPriceMinor !== undefined &&
      (!Number.isSafeInteger(opts.maxPriceMinor) || opts.maxPriceMinor < 0))) {
    throw new AppError('VALIDATION_ERROR', 'Invalid catalog list options');
  }
  const page = await listRows(businessId, { ...opts, status: 'active', limit: Math.min(limit, 100) });
  return { items: page.items.map(itemView), nextCursor: page.nextCursor };
}

export async function getCatalogItemDetails(businessId: string, itemIds: string[]): Promise<CatalogItemDetail[]> {
  if (itemIds.length > 100) throw new AppError('VALIDATION_ERROR', 'Too many catalog ids');
  const ids = itemIds.filter(isItemId);
  if (!ids.length) return [];
  const { rows } = await db.query<ItemRow>(selectItems +
    ' FROM catalog_items i WHERE i.business_id=$1 AND i.active AND i.deleted_at IS NULL AND i.id=ANY($2::uuid[])',
    [businessId, ids]);
  const byId = new Map(rows.map((entry) => [entry.id, detailView(entry)]));
  return ids.flatMap((id) => {
    const item = byId.get(id.toLowerCase());
    return item ? [item] : [];
  });
}

export async function listItems(businessId: string, query: ListQuery): Promise<Page<CatalogItemRow> & { missingNameEn: number }> {
  const [page, missing] = await Promise.all([
    listRows(businessId, { ...query, query: query.q }),
    db.one<{ count: number }>('SELECT count(*)::int AS count FROM catalog_items WHERE business_id=$1 AND active AND deleted_at IS NULL AND name_en IS NULL', [businessId]),
  ]);
  return {
    missingNameEn: missing.count,
    nextCursor: page.nextCursor,
    items: page.items.map((row) => {
      const priceMinor = minorAmount(row.price_minor);
      const prices = row.variants.filter((variant) => variant.active && variant.priceMinor !== null)
        .map((variant) => minorAmount(variant.priceMinor!));
      const image = row.images[0];
      return {
        id: row.id, sku: row.sku, kind: row.kind, name: row.name, nameEn: row.name_en, category: row.category,
        priceMinor, hasVariantPrices: prices.length > 0, minPriceMinor: Math.min(priceMinor, ...prices),
        unit: row.unit, stock: row.stock, active: row.active, version: row.version, variantCount: row.variants.length,
        imageUrl: image ? '/api/v1/businesses/' + businessId + '/catalog/items/' + row.id + '/images/' + image.id + '/file' : null,
        updatedAt: row.updated_at.toISOString(),
      };
    }),
  };
}

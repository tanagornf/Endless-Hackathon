import { db } from '../../core';
import type { ProductRef } from '@nless/shared/features/catalog/types';
import { englishNameKey, isItemId, nameKey, selectItems } from './repo';
import type { ResolvedRow } from './repo';
import { catalogKey, literalContains } from './sku';

const visibleItems = ' WHERE i.business_id=$1 AND i.deleted_at IS NULL AND i.active';

export async function resolveProduct(businessId: string, ref: ProductRef): Promise<ResolvedRow | null> {
  if ('itemId' in ref) {
    if (!isItemId(ref.itemId)) return null;
    return db.maybeOne<ResolvedRow>(selectItems + ', NULL AS matched_variant_id FROM catalog_items i' +
      visibleItems + ' AND i.id=$2', [businessId, ref.itemId]);
  }
  if ('sku' in ref) {
    const sku = catalogKey(ref.sku);
    if (!sku) return null;
    return db.maybeOne<ResolvedRow>(
      selectItems + ', r.variant_id AS matched_variant_id FROM catalog_items i ' +
      'JOIN catalog_sku_registry r ON r.business_id=i.business_id AND r.item_id=i.id' + visibleItems + ' AND r.sku_key=$2',
      [businessId, sku],
    );
  }
  const name = catalogKey(ref.name);
  if (!name) return null;
  const english = "COALESCE(" + englishNameKey + ", '')";
  const { rows } = await db.query<ResolvedRow>(selectItems + ', NULL AS matched_variant_id, (' +
    nameKey + '=$2 OR ' + english + '=$2) AS exact_name FROM catalog_items i' + visibleItems +
    ' AND (' + nameKey + " LIKE $3 ESCAPE '!' OR " + english + " LIKE $3 ESCAPE '!')" +
    ' ORDER BY exact_name DESC,i.id LIMIT 2', [businessId, name, literalContains(name)]);
  if (rows.length < 2 || rows[0].exact_name !== rows[1].exact_name) return rows[0] ?? null;
  return null;
}

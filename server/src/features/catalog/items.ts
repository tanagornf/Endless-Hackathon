import { AppError, audit, db } from '../../core';
import type { DbExecutor } from '../../core';
import type { CatalogItemAdminDetail } from '@nless/shared/features/catalog/types';
import { adminView, findItemRow, minorAmount } from './repo';
import type { ItemRow } from './repo';
import type { CreateItemBody, PatchItemBody } from './schema';
import { catalogKey } from './sku';

type Actor = { userId: string | null };

async function registerSku(tx: DbExecutor, businessId: string, itemId: string, sku: string, variantId: string | null = null) {
  const key = catalogKey(sku);
  const found = await tx.maybeOne<{ item_id: string }>(
    'INSERT INTO catalog_sku_registry (business_id,sku_key,item_id,variant_id) VALUES ($1,$2,$3,$4) ' +
    'ON CONFLICT DO NOTHING RETURNING item_id',
    [businessId, key, itemId, variantId],
  );
  if (found) return;
  const existing = await tx.maybeOne<{ item_id: string }>(
    'SELECT item_id FROM catalog_sku_registry WHERE business_id=$1 AND sku_key=$2', [businessId, key],
  );
  throw new AppError('VALIDATION_ERROR', 'Catalog SKU is already in use', {
    details: { code: 'sku_taken', itemId: existing?.item_id ?? null },
  });
}

function itemAudit(action: string, businessId: string, itemId: string, actor: Actor, details?: Record<string, unknown>) {
  return audit({ action, businessId, actorUserId: actor.userId, targetType: 'catalog_item', targetId: itemId, details });
}

export async function createItem(businessId: string, actor: Actor, body: CreateItemBody): Promise<CatalogItemAdminDetail> {
  const row = await db.tx(async (tx) => {
    const { id } = await tx.one<{ id: string }>(
      'INSERT INTO catalog_items (business_id,sku,kind,name,name_en,description,category,price_minor,unit,stock,shippable,duration_minutes,active,created_by,updated_by) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING id',
      [businessId, body.sku, body.kind, body.name, body.nameEn, body.description, body.category, body.priceMinor,
        body.unit, body.stock, body.shippable, body.durationMinutes, body.active, actor.userId],
    );
    await registerSku(tx, businessId, id, body.sku);
    const variantNames = new Set<string>();
    for (const [position, variant] of body.variants.entries()) {
      const name = catalogKey(variant.name);
      if (variantNames.has(name)) {
        throw new AppError('VALIDATION_ERROR', 'Catalog variant name is already in use', { details: { code: 'variant_name_taken' } });
      }
      variantNames.add(name);
      const inserted = await tx.one<{ id: string }>(
        'INSERT INTO catalog_variants (business_id,item_id,name,name_key,sku,price_minor,stock,position,active) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
        [businessId, id, variant.name, name, variant.sku, variant.priceMinor, variant.stock, position, variant.active],
      );
      if (variant.sku !== null) await registerSku(tx, businessId, id, variant.sku, inserted.id);
    }
    await tx.query('INSERT INTO catalog_price_history (business_id,item_id,version,new_price_minor,changed_by) VALUES ($1,$2,1,$3,$4)',
      [businessId, id, body.priceMinor, actor.userId]);
    return findItemRow(tx, businessId, id);
  });
  await itemAudit('catalog.item.create', businessId, row.id, actor);
  return adminView(row);
}

const columns = {
  sku: 'sku', name: 'name', nameEn: 'name_en', description: 'description', category: 'category', priceMinor: 'price_minor',
  unit: 'unit', stock: 'stock', shippable: 'shippable', durationMinutes: 'duration_minutes', active: 'active',
} as const;
type CatalogField = keyof typeof columns;

function currentValue(item: ItemRow, field: CatalogField) {
  return field === 'priceMinor' ? minorAmount(item.price_minor) : item[columns[field]];
}

function verifyKind(item: ItemRow, body: PatchItemBody): void {
  const stock = body.stock === undefined ? item.stock : body.stock;
  const duration = body.durationMinutes === undefined ? item.duration_minutes : body.durationMinutes;
  const shippable = body.shippable ?? item.shippable;
  if ((item.kind === 'service') !== (duration !== null) || (item.kind === 'service' && (stock !== null || shippable))) {
    throw new AppError('VALIDATION_ERROR', 'Invalid stock, shipping or duration for catalog item kind');
  }
}

export async function patchItem(businessId: string, actor: Actor, itemId: string, body: PatchItemBody): Promise<CatalogItemAdminDetail> {
  const result = await db.tx(async (tx) => {
    const current = await findItemRow(tx, businessId, itemId, true);
    if (current.version !== body.expectedVersion) {
      throw new AppError('VERSION_CONFLICT', 'Catalog version changed', { details: { currentVersion: current.version } });
    }
    verifyKind(current, body);
    const changed = (Object.keys(columns) as CatalogField[])
      .filter((field) => body[field] !== undefined && body[field] !== currentValue(current, field));
    if (!changed.length) return { saved: current, current, changed };
    if (body.sku !== undefined && catalogKey(body.sku) !== catalogKey(current.sku)) {
      await registerSku(tx, businessId, itemId, body.sku);
      await tx.query('DELETE FROM catalog_sku_registry WHERE business_id=$1 AND item_id=$2 AND sku_key=$3 AND variant_id IS NULL',
        [businessId, itemId, catalogKey(current.sku)]);
    }
    const values: unknown[] = [businessId, itemId, body.expectedVersion, actor.userId];
    const assignments = changed.map((field) => columns[field] + '=$' + values.push(body[field]));
    if (changed.some((field) => field !== 'description' && field !== 'category')) assignments.push('version=version+1');
    if (changed.includes('priceMinor')) assignments.push('price_changed_at=now()');
    const updated = await tx.maybeOne<{ version: number }>(
      'UPDATE catalog_items SET updated_at=now(),updated_by=$4,' + assignments.join(',') +
      ' WHERE business_id=$1 AND id=$2 AND version=$3 AND deleted_at IS NULL RETURNING version', values,
    );
    if (!updated) throw new AppError('VERSION_CONFLICT', 'Catalog version changed', { details: { currentVersion: current.version } });

    if (changed.includes('priceMinor')) {
      await tx.query('INSERT INTO catalog_price_history (business_id,item_id,version,old_price_minor,new_price_minor,changed_by) VALUES ($1,$2,$3,$4,$5,$6)',
        [businessId, itemId, updated.version, current.price_minor, body.priceMinor, actor.userId]);
    }
    if (changed.includes('stock') && body.stock != null) {
      await tx.query(
        "INSERT INTO catalog_stock_moves (business_id,item_id,delta,stock_after,reason,actor_user_id) VALUES ($1,$2,$3,$4,'manual',$5)",
        [businessId, itemId, body.stock - (current.stock ?? 0), body.stock, actor.userId],
      );
    }
    return { saved: await findItemRow(tx, businessId, itemId), current, changed };
  });

  if (result.changed.includes('priceMinor')) {
    await itemAudit('catalog.price.change', businessId, itemId, actor, {
      oldPriceMinor: minorAmount(result.current.price_minor), newPriceMinor: minorAmount(result.saved.price_minor), version: result.saved.version,
    });
  }
  const otherFields = result.changed.filter((field) => field !== 'priceMinor');
  if (otherFields.length) await itemAudit('catalog.item.update', businessId, itemId, actor, { fields: otherFields });
  return adminView(result.saved);
}

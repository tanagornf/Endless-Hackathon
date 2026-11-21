import { AppError, auditInTransaction, db } from '../../core';
import type { DbExecutor } from '../../core';
import { isItemId } from './repo';

type StockAdjustment = {
  businessId: string; itemId: string; variantId?: string | null; delta: number;
  reason: 'order' | 'order_cancel' | 'correction'; refType: string; refId: string; actorUserId: string | null;
};

type Receipt = {
  stock_after: number | null; item_version: number; stock_variant_id: string | null;
  delta: number; reason: StockAdjustment['reason'];
};
type Item = { stock: number | null; version: number; deleted: boolean };
type StockBucket = { stock: number | null; variantId: string | null };
const MAX_STOCK = 2_147_483_647;

async function readReceipt(tx: DbExecutor, input: StockAdjustment, refType = input.refType) {
  return tx.maybeOne<Receipt>(
    `SELECT stock_after,item_version,stock_variant_id,delta,reason FROM catalog_stock_adjustments
    WHERE business_id=$1 AND ref_type=$2 AND ref_id=$3 AND item_id=$4 AND variant_id IS NOT DISTINCT FROM $5::uuid`,
    [input.businessId, refType, input.refId, input.itemId, input.variantId ?? null],
  );
}

async function saveReceipt(tx: DbExecutor, input: StockAdjustment, variantId: string | null, stockAfter: number | null, version: number) {
  await tx.query(
    `INSERT INTO catalog_stock_adjustments
      (business_id,item_id,variant_id,stock_variant_id,ref_type,ref_id,reason,delta,stock_after,item_version)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [input.businessId, input.itemId, input.variantId ?? null, variantId,
      input.refType, input.refId, input.reason, input.delta, stockAfter, version],
  );
}

async function lockVariant(tx: DbExecutor, { businessId, itemId }: StockAdjustment, variantId: string) {
  return tx.maybeOne<{ id: string; stock: number | null }>(
    'SELECT id,stock FROM catalog_variants WHERE business_id=$1 AND item_id=$2 AND id=$3 FOR UPDATE',
    [businessId, itemId, variantId],
  );
}

async function resolveBucket(tx: DbExecutor, input: StockAdjustment, item: Item): Promise<StockBucket> {
  if (input.reason === 'order_cancel') {
    const debit = await readReceipt(tx, input, 'order');
    if (!debit || debit.reason !== 'order' || debit.stock_after === null || debit.delta >= 0) {
      return { variantId: null, stock: null };
    }
    if (input.delta !== -debit.delta) throw new AppError('VALIDATION_ERROR', 'Cancellation amount must match the original debit');
    if (!debit.stock_variant_id) return { variantId: null, stock: item.stock };
    const variant = await lockVariant(tx, input, debit.stock_variant_id);
    // A removed or untracked bucket must never redirect a return to another bucket.
    return { variantId: debit.stock_variant_id, stock: variant?.stock ?? null };
  }
  if (item.deleted) throw new AppError('NOT_FOUND', 'Catalog item not found');
  if (input.reason === 'order' && input.refType === 'order' && await readReceipt(tx, input, 'order_cancel')) {
    return { variantId: null, stock: null };
  }
  if (input.variantId) {
    const variant = await lockVariant(tx, input, input.variantId);
    if (!variant) throw new AppError('NOT_FOUND', 'Catalog variant not found');
    if (variant.stock !== null) return { variantId: variant.id, stock: variant.stock };
  }
  return { variantId: null, stock: item.stock };
}

async function moveStock(tx: DbExecutor, input: StockAdjustment, stockVariantId: string | null) {
  const { actorUserId, businessId, itemId, delta, reason, refType, refId } = input;
  let changed: { stock: number; version: number };
  if (stockVariantId === null) {
    changed = await tx.one(
      'UPDATE catalog_items SET stock=stock+$3,version=version+1,updated_at=now(),updated_by=$4 ' +
      'WHERE business_id=$1 AND id=$2 RETURNING stock,version',
      [businessId, itemId, delta, actorUserId],
    );
  } else {
    const { stock } = await tx.one<{ stock: number }>(
      'UPDATE catalog_variants SET stock=stock+$4,updated_at=now() WHERE business_id=$1 AND item_id=$2 AND id=$3 RETURNING stock',
      [businessId, itemId, stockVariantId, delta],
    );
    const { version } = await tx.one<{ version: number }>(
      'UPDATE catalog_items SET version=version+1,updated_at=now(),updated_by=$3 WHERE business_id=$1 AND id=$2 RETURNING version',
      [businessId, itemId, actorUserId],
    );
    changed = { stock, version };
  }
  await tx.query(
    `INSERT INTO catalog_stock_moves (business_id,item_id,variant_id,delta,stock_after,reason,ref_type,ref_id,actor_user_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [businessId, itemId, input.variantId ?? null, delta, changed.stock, reason, refType, refId, actorUserId],
  );
  await saveReceipt(tx, input, stockVariantId, changed.stock, changed.version);
  await auditInTransaction(tx, [{
    action: 'catalog.stock.adjust', businessId, actorUserId, targetType: 'catalog_item', targetId: itemId,
    details: { delta, reason, refType, refId, variantId: input.variantId ?? null, stockVariantId, stockAfter: changed.stock, version: changed.version },
  }]);
  return { stockAfter: changed.stock, applied: true, version: changed.version };
}

export async function adjustCatalogStock(input: StockAdjustment): Promise<{ stockAfter: number | null; applied: boolean; version: number }> {
  if (!isItemId(input.businessId) || !isItemId(input.itemId) || (input.variantId != null && !isItemId(input.variantId))) {
    throw new AppError('NOT_FOUND', 'Catalog item or variant not found');
  }
  if (!Number.isInteger(input.delta) || Math.abs(input.delta) > MAX_STOCK ||
      !input.refType || !input.refId || (input.reason === 'order' && input.delta >= 0) ||
      (input.reason === 'order_cancel' && (input.delta <= 0 || input.refType !== 'order_cancel'))) {
    throw new AppError('VALIDATION_ERROR', 'Invalid stock adjustment or reference');
  }
  return db.tx(async (tx) => {
    const item = await tx.maybeOne<Item>(
      'SELECT stock,version,deleted_at IS NOT NULL AS deleted FROM catalog_items WHERE business_id=$1 AND id=$2 FOR UPDATE',
      [input.businessId, input.itemId],
    );
    if (!item) throw new AppError('NOT_FOUND', 'Catalog item not found');
    const prior = await readReceipt(tx, input);
    if (prior) return { stockAfter: prior.stock_after, applied: false, version: prior.item_version };
    const bucket = await resolveBucket(tx, input, item);
    if (bucket.stock === null) {
      await saveReceipt(tx, input, bucket.variantId, null, item.version);
      return { stockAfter: null, applied: false, version: item.version };
    }
    const next = bucket.stock + input.delta;
    if (next < 0) throw new AppError('SOLD_OUT', 'Insufficient catalog stock');
    if (next > MAX_STOCK) throw new AppError('VALIDATION_ERROR', 'Catalog stock is above the supported range');
    return moveStock(tx, input, bucket.variantId);
  });
}

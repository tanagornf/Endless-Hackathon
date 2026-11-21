import { randomUUID } from 'node:crypto';
import { auditInTransaction } from '../../core';
import type { AuditInput, DbExecutor } from '../../core';
import type { CatalogImportResult } from '@nless/shared/features/catalog/types';
import type { DraftRow, UpdateRow } from './import';
import { catalogKey } from './sku';

type Scope = { businessId: string; actorUserId: string | null; importId: string };

export async function writeDrafts(tx: DbExecutor, { businessId, actorUserId, importId }: Scope, drafts: DraftRow[]) {
  if (!drafts.length) return;
  const items = drafts.map(({ result, body }) => {
    const id = randomUUID();
    result.itemId = id;
    return { ...body, id };
  });
  const variants = items.flatMap((item) => item.variants.map((variant, position) => ({
    ...variant, nameKey: catalogKey(variant.name), id: randomUUID(), itemId: item.id, position,
  })));
  const values = items.map(({ variants: _variants, ...item }) => item);
  await tx.query(
    `INSERT INTO catalog_items (id,business_id,sku,kind,name,name_en,description,category,price_minor,unit,
      stock,shippable,duration_minutes,active,source,source_ref,created_by,updated_by)
    SELECT id,$1,sku,kind,name,"nameEn",description,category,"priceMinor",unit,stock,shippable,
      "durationMinutes",false,'import',$3,$2,$2
    FROM jsonb_to_recordset($4::jsonb) AS d(id uuid,sku text,kind text,name text,"nameEn" text,
      description text,category text,"priceMinor" bigint,unit text,stock int,shippable boolean,"durationMinutes" int)`,
    [businessId, actorUserId, importId, JSON.stringify(values)],
  );
  if (variants.length) {
    await tx.query(
      `INSERT INTO catalog_variants (id,business_id,item_id,name,name_key,sku,price_minor,stock,position,active)
      SELECT id,$1,"itemId",name,"nameKey",sku,"priceMinor",stock,position,true
      FROM jsonb_to_recordset($2::jsonb) AS v(id uuid,"itemId" uuid,name text,"nameKey" text,sku text,
        "priceMinor" bigint,stock int,position int)`,
      [businessId, JSON.stringify(variants)],
    );
  }
  const registrations = [
    ...items.map(({ id, sku }) => ({ itemId: id, variantId: null, key: catalogKey(sku) })),
    ...variants.flatMap(({ id, itemId, sku }) => sku === null ? [] : [{ itemId, variantId: id, key: catalogKey(sku) }]),
  ];
  await tx.query(
    `INSERT INTO catalog_sku_registry (business_id,sku_key,item_id,variant_id)
    SELECT $1,key,"itemId","variantId" FROM jsonb_to_recordset($2::jsonb) AS sku(key text,"itemId" uuid,"variantId" uuid)
    ORDER BY key`,
    [businessId, JSON.stringify(registrations)],
  );
  await tx.query(
    `INSERT INTO catalog_price_history (business_id,item_id,version,new_price_minor,changed_by)
    SELECT $1,id,1,"priceMinor",$2 FROM jsonb_to_recordset($3::jsonb) AS d(id uuid,"priceMinor" bigint)`,
    [businessId, actorUserId, JSON.stringify(values)],
  );
}

export async function writeUpdates(tx: DbExecutor, { businessId, actorUserId }: Scope, updates: UpdateRow[]) {
  if (!updates.length) return;
  const values = updates.map(({ id, before, after, changed }) => ({
    id, ...after,
    oldPrice: before.priceMinor,
    stockDelta: changed.includes('stock') && after.stock !== null ? after.stock - (before.stock ?? 0) : null,
    versionBump: changed.some((field) => field !== 'description' && field !== 'category') ? 1 : 0,
  }));
  await tx.query(
    `WITH source AS (
      SELECT * FROM jsonb_to_recordset($3::jsonb) AS r(id uuid,name text,"nameEn" text,description text,category text,
        unit text,stock int,shippable boolean,"priceMinor" bigint,"oldPrice" bigint,"stockDelta" int,"versionBump" int)
    ), updated AS (
      UPDATE catalog_items i SET name=s.name,name_en=s."nameEn",description=s.description,category=s.category,
        unit=s.unit,stock=s.stock,shippable=s.shippable,price_minor=s."priceMinor",version=i.version+s."versionBump",
        price_changed_at=CASE WHEN s."priceMinor"<>s."oldPrice" THEN now() ELSE i.price_changed_at END,
        updated_at=now(),updated_by=$2
      FROM source s WHERE i.business_id=$1 AND i.id=s.id AND i.deleted_at IS NULL
      RETURNING i.id,i.version,i.price_minor,s."oldPrice",i.stock,s."stockDelta"
    ), prices AS (
      INSERT INTO catalog_price_history (business_id,item_id,version,old_price_minor,new_price_minor,changed_by)
      SELECT $1,id,version,"oldPrice",price_minor,$2 FROM updated WHERE "oldPrice"<>price_minor
    )
    INSERT INTO catalog_stock_moves (business_id,item_id,delta,stock_after,reason,actor_user_id)
    SELECT $1,id,"stockDelta",stock,'import',$2 FROM updated WHERE "stockDelta" IS NOT NULL`,
    [businessId, actorUserId, JSON.stringify(values)],
  );
}

export async function auditImport(tx: DbExecutor, { businessId, actorUserId, importId }: Scope, result: CatalogImportResult, updates: UpdateRow[]) {
  const events: AuditInput[] = [{
    action: 'catalog.import', businessId, actorUserId, targetType: 'catalog_item',
    details: { importId, created: result.created, updated: result.updated, skipped: result.skipped, errors: result.errors.length },
  }];
  for (const { id, before, after, changed } of updates) {
    events.push({
      action: 'catalog.item.update', businessId, actorUserId, targetType: 'catalog_item', targetId: id,
      details: { fields: changed, importId },
    });
    if (before.priceMinor !== after.priceMinor) {
      events.push({
        action: 'catalog.price.change', businessId, actorUserId, targetType: 'catalog_item', targetId: id,
        details: { oldPriceMinor: before.priceMinor, newPriceMinor: after.priceMinor, importId },
      });
    }
  }
  await auditInTransaction(tx, events);
}

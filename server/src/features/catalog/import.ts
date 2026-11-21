import { AppError, db } from '../../core';
import type { DbExecutor } from '../../core';
import type { CatalogImportError, CatalogImportResult, CatalogImportRow } from '@nless/shared/features/catalog/types';
import { auditImport, writeDrafts, writeUpdates } from './import-writes';
import { minorAmount } from './repo';
import { CatalogSku, CreateItemBody } from './schema';
import { catalogKey, lockCatalogSkuWrites } from './sku';

type Input = {
  businessId: string; actorUserId: string | null; importId: string; rows: CatalogImportRow[];
  mode?: 'create_only' | 'update_existing'; onError?: 'abort' | 'skip_row'; dryRun?: boolean;
};
type ItemResult = CatalogImportResult['items'][number];
type ErrorCode = CatalogImportError['code'];
type RegisteredSku = {
  sku_key: string; variant_id: string | null; item_id: string; kind: 'product' | 'service';
  name: string; name_en: string | null; description: string | null; category: string | null;
  unit: string; price_minor: string; stock: number | null; shippable: boolean; duration_minutes: number | null;
};
const editable = ['priceMinor', 'name', 'nameEn', 'description', 'category', 'unit', 'stock', 'shippable'] as const;
export type EditableItem = Pick<CreateItemBody, (typeof editable)[number]>;
export type DraftRow = { result: ItemResult; body: CreateItemBody };
export type UpdateRow = { id: string; before: EditableItem; after: EditableItem; changed: (keyof EditableItem)[] };

const validationCode: Record<string, ErrorCode> = {
  sku: 'sku_invalid', name: 'name_required', priceMinor: 'price_invalid', stock: 'stock_invalid',
  shippable: 'stock_invalid', durationMinutes: 'duration_required', kind: 'stock_invalid', variants: 'variant_invalid',
};

const errorMessages: Record<ErrorCode, string> = {
  sku_invalid: 'Enter a valid SKU',
  sku_taken: 'This SKU is already in use',
  sku_duplicate_in_file: 'This SKU appears more than once in the import',
  name_required: 'Enter a valid catalog name and text fields',
  price_invalid: 'Enter a valid integer price in satang',
  stock_invalid: 'Enter valid tracking and shipping settings',
  duration_required: 'Enter a valid duration for a service',
  variant_invalid: 'Enter valid and unique variant details',
  variant_limit: 'At most 50 variants per item',
  sku_exists: 'This item already exists',
};

function lookupKey(value: unknown) {
  const sku = CatalogSku.safeParse(value);
  return sku.success ? catalogKey(sku.data) : '';
}

async function getRegisteredSkus(tx: DbExecutor, input: Input) {
  const keys = new Set<string>();
  for (const row of input.rows) {
    keys.add(lookupKey(row.sku));
    if (Array.isArray(row.variants) && row.variants.length <= 50) {
      for (const variant of row.variants) keys.add(lookupKey(variant?.sku));
    }
  }
  keys.delete('');
  const { rows } = await tx.query<RegisteredSku>(
    `SELECT r.sku_key,r.variant_id,i.id AS item_id,i.kind,i.name,i.name_en,i.description,
      i.category,i.unit,i.price_minor,i.stock,i.shippable,i.duration_minutes
    FROM catalog_sku_registry r JOIN catalog_items i ON i.business_id=r.business_id AND i.id=r.item_id
    WHERE r.business_id=$1 AND r.sku_key=ANY($2::text[]) AND i.deleted_at IS NULL
    ORDER BY i.id` + (input.dryRun ? '' : ' FOR UPDATE OF i'),
    [input.businessId, [...keys]],
  );
  return new Map(rows.map((row) => [row.sku_key, row]));
}

function editableValues(row: RegisteredSku): EditableItem {
  return {
    name: row.name, nameEn: row.name_en, description: row.description, category: row.category,
    unit: row.unit, priceMinor: minorAmount(row.price_minor), stock: row.stock, shippable: row.shippable,
  };
}

function validateRow(row: CatalogImportRow, current: RegisteredSku | undefined) {
  const { rowNo: _rowNo, ...source } = row;
  const defined = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== undefined));
  const defaults = current ? editableValues(current) : { shippable: (source.kind ?? 'product') === 'product' };
  return CreateItemBody.safeParse({
    kind: 'product', ...defaults, ...defined, active: false,
    ...(current && { kind: current.kind, durationMinutes: current.duration_minutes }),
  });
}

async function applyImport(tx: DbExecutor, input: Input) {
  if (!input.dryRun) await lockCatalogSkuWrites(tx, input.businessId);
  const registered = await getRegisteredSkus(tx, input);
  const seen = new Set<string>();
  const result: CatalogImportResult = { applied: false, created: 0, updated: 0, skipped: 0, errors: [], items: [] };
  const drafts: DraftRow[] = [];
  const updates: UpdateRow[] = [];
  for (const row of input.rows) {
    const key = lookupKey(row.sku);
    const existing = registered.get(key);
    const current = existing && existing.variant_id === null ? existing : undefined;
    const resultRow: ItemResult = {
      rowNo: row.rowNo, sku: typeof row.sku === 'string' ? row.sku : '', itemId: null, action: 'error',
    };
    result.items.push(resultRow);
    const reject = (code: ErrorCode) => {
      result.errors.push({ rowNo: row.rowNo, sku: resultRow.sku || null, code, message: errorMessages[code] });
      result.skipped++;
    };
    if (Array.isArray(row.variants) && row.variants.length > 50) {
      reject('variant_limit');
      continue;
    }
    const checked = validateRow(row, current);
    if (!checked.success) {
      reject(validationCode[String(checked.error.issues[0]?.path[0])] ?? 'name_required');
      continue;
    }
    const body = checked.data;
    resultRow.sku = body.sku;
    const variantKeys = body.variants.flatMap(({ sku }) => sku === null ? [] : [catalogKey(sku)]);
    const variantNames = new Set(body.variants.map(({ name }) => catalogKey(name)));
    if (variantNames.size !== body.variants.length) {
      reject('variant_invalid');
      continue;
    }
    const claimed = current ? [key] : [key, ...variantKeys];
    if (new Set(claimed).size !== claimed.length || claimed.some((entry) => seen.has(entry))) {
      reject('sku_duplicate_in_file');
      continue;
    }
    for (const entry of claimed) seen.add(entry);
    if (existing?.variant_id || (!current && variantKeys.some((entry) => registered.has(entry)))) {
      reject('sku_taken');
      continue;
    }
    if (current) {
      resultRow.itemId = current.item_id;
      if (input.mode !== 'update_existing') {
        resultRow.action = 'skipped';
        reject('sku_exists');
        continue;
      }
      const before = editableValues(current);
      const changed = editable.filter((field) => body[field] !== before[field]);
      if (changed.length) updates.push({ id: current.item_id, before, after: body, changed });
      resultRow.action = 'updated';
      result.updated++;
      continue;
    }
    resultRow.action = 'created';
    result.created++;
    drafts.push({ result: resultRow, body });
  }
  if (input.dryRun || (input.onError !== 'skip_row' && result.errors.length)) return result;
  await writeDrafts(tx, input, drafts);
  await writeUpdates(tx, input, updates);
  await auditImport(tx, input, result, updates);
  result.applied = true;
  return result;
}

export async function importCatalogItems(input: Input): Promise<CatalogImportResult> {
  if (!Array.isArray(input.rows) || input.rows.length < 1 || input.rows.length > 500) {
    throw new AppError('VALIDATION_ERROR', 'Catalog imports must contain between 1 and 500 rows');
  }
  return input.dryRun ? applyImport(db, input) : db.tx((tx) => applyImport(tx, input));
}

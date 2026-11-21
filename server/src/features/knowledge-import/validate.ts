import type { CatalogImportRow } from '@nless/shared/features/catalog/types';
import type { CatalogField, CatalogRowData, FaqField, ImportData, ImportMapping, ImportOptions, ImportRowStatus } from '@nless/shared/features/knowledge-import/types';
import { importCatalogItems, listCatalogItems, parsePriceToMinor } from '../catalog/service';
import { CATALOG_CHUNK } from './config';
import { truncateCodePoints } from './decode';

export interface RawRow { rowNo: number; raw: string[] }
export interface CheckedRow {
  rowNo: number;
  status: ImportRowStatus;
  data: ImportData | null;
  error: { code: string; column: string | null; message: string } | null;
  warnings: { code: string; itemId?: string }[];
  createdRef?: string | null;
}

const thaiDigits = (value: string) => value.replace(/[๐-๙]/gu, digit => String(digit.codePointAt(0)! - 0x0e50));
export const normalizeQuestion = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\p{M}]/gu, '');

const messages: Record<string, string> = {
  sku_missing: 'ไม่มีรหัสสินค้า',
  sku_invalid: 'รหัสสินค้าไม่ถูกต้อง',
  sku_duplicate_in_file: 'รหัสซ้ำในไฟล์',
  name_required: 'ไม่มีชื่อสินค้า',
  price_invalid: 'ราคาไม่ถูกต้อง',
  stock_invalid: 'สต็อกไม่ถูกต้อง',
  duration_invalid: 'ระยะเวลาต้องอยู่ระหว่าง 5–600 นาที',
  question_invalid: 'คำถามต้องยาว 5–200 ตัวอักษร',
  answer_invalid: 'คำตอบต้องยาว 5–1,000 ตัวอักษร',
  question_duplicate_in_file: 'คำถามซ้ำในไฟล์',
};

export const readyRow = (rowNo: number, data: ImportData, warnings: CheckedRow['warnings'] = []): CheckedRow =>
  ({ rowNo, status: 'ready', data, error: null, warnings });

function parseCatalogRow(raw: RawRow, mapping: NonNullable<ImportMapping['catalog']>, header: string[], seen: Map<string, number>): CheckedRow {
  const read = (field: CatalogField) => raw.raw[mapping[field] ?? -1]?.trim() ?? '';
  const invalid = (field: CatalogField, code: string, detail = ''): CheckedRow => ({
    rowNo: raw.rowNo, status: 'error', data: null, warnings: [],
    error: { code, column: header[mapping[field] ?? -1] ?? null, message: messages[code] + detail },
  });
  const sku = read('sku');
  if (!sku) return invalid('sku', 'sku_missing');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(sku)) return invalid('sku', 'sku_invalid');
  const first = seen.get(sku.toLowerCase());
  if (first !== undefined) return invalid('sku', 'sku_duplicate_in_file', ' (' + first + ')');
  seen.set(sku.toLowerCase(), raw.rowNo);

  const name = read('name');
  if (!name) return invalid('name', 'name_required');
  const priceMinor = parsePriceToMinor(read('price'));
  if (priceMinor === null) return invalid('price', 'price_invalid');
  const stock = thaiDigits(read('stock'));
  if (stock && !/^\d{1,7}$/u.test(stock)) return invalid('stock', 'stock_invalid');
  const duration = thaiDigits(read('durationMinutes'));
  const durationMinutes = duration ? Number(duration) : null;
  if (durationMinutes !== null && (!/^\d+$/u.test(duration) || durationMinutes < 5 || durationMinutes > 600)) {
    return invalid('durationMinutes', 'duration_invalid');
  }

  const warnings: CheckedRow['warnings'] = [];
  const optional = (field: CatalogField, length: number) => {
    const value = read(field);
    if (!value) return null;
    const clipped = truncateCodePoints(value, length);
    if (clipped !== value && !warnings.length) warnings.push({ code: 'truncated' });
    return clipped;
  };
  return readyRow(raw.rowNo, {
    sku, name: optional('name', 200) ?? name, nameEn: optional('nameEn', 200),
    description: optional('description', 2000), category: optional('category', 100), priceMinor, unit: optional('unit', 20),
    stock: stock && durationMinutes === null ? Number(stock) : null, durationMinutes,
    kind: durationMinutes === null ? 'product' : 'service', existing: null,
  }, warnings);
}

function parseFaqRow(raw: RawRow, mapping: NonNullable<ImportMapping['faq']>, header: string[], seen: Set<string>): CheckedRow {
  const read = (field: FaqField) => raw.raw[mapping[field] ?? -1]?.trim() ?? '';
  const invalid = (field: FaqField, code: string): CheckedRow => ({
    rowNo: raw.rowNo, status: 'error', data: null, warnings: [],
    error: { code, column: header[mapping[field] ?? -1] ?? null, message: messages[code] },
  });
  const question = read('question');
  const answer = read('answer');
  if (question.length < 5 || question.length > 200) return invalid('question', 'question_invalid');
  if (answer.length < 5 || answer.length > 1000) return invalid('answer', 'answer_invalid');
  const key = normalizeQuestion(question);
  if (seen.has(key)) return invalid('question', 'question_duplicate_in_file');
  seen.add(key);
  return readyRow(raw.rowNo, { question, answer, sourceQuote: null, folder: truncateCodePoints(read('folder'), 100) || null });
}

export function checkRows(rows: RawRow[], header: string[], target: 'catalog' | 'faq', mapping: ImportMapping): CheckedRow[] {
  const skus = new Map<string, number>();
  const questions = new Set<string>();
  return rows.map(row => target === 'catalog'
    ? parseCatalogRow(row, mapping.catalog ?? {}, header, skus)
    : parseFaqRow(row, mapping.faq ?? {}, header, questions));
}

export function toCatalogRow(row: Pick<CheckedRow, 'data' | 'rowNo'>): CatalogImportRow {
  const data = row.data as CatalogRowData;
  return {
    rowNo: row.rowNo, sku: data.sku, name: data.name, nameEn: data.nameEn,
    description: data.description, category: data.category, priceMinor: data.priceMinor,
    unit: data.unit ?? undefined, stock: data.stock, durationMinutes: data.durationMinutes, kind: data.kind,
  };
}

export async function checkCatalogPreview(input: {
  businessId: string; actorUserId: string | null; importId: string; mode: ImportOptions['catalogMode'];
  rows: CheckedRow[]; priceColumn: string | null; skuColumn: string | null;
}, progress: (done: number, total: number) => Promise<void>): Promise<void> {
  const candidates = input.rows.filter(row => row.status === 'ready');
  let priceLookups = 0;
  for (let start = 0; start < candidates.length; start += CATALOG_CHUNK) {
    const batch = candidates.slice(start, start + CATALOG_CHUNK);
    const result = await importCatalogItems({
      businessId: input.businessId, actorUserId: input.actorUserId, importId: input.importId,
      rows: batch.map(toCatalogRow), mode: input.mode, onError: 'skip_row', dryRun: true,
    });
    const errors = new Map(result.errors.map(error => [error.rowNo, error]));
    const items = new Map(result.items.map(item => [item.rowNo, item]));
    for (const row of batch) {
      const error = errors.get(row.rowNo);
      const item = items.get(row.rowNo);
      if (error || item?.action === 'skipped' || item?.action === 'error') {
        row.status = (error?.code === 'sku_exists' && input.mode === 'create_only') || item?.action === 'skipped' ? 'skipped' : 'error';
        row.error = {
          code: error?.code ?? 'catalog_rejected',
          column: error?.code.startsWith('sku_') ? input.skuColumn : error?.code === 'price_invalid' ? input.priceColumn : null,
          message: (error?.message ?? 'Catalog row declined').slice(0, 300),
        };
      } else if (item?.action === 'updated') {
        row.warnings.push({ code: 'price_will_change' });
        if (priceLookups++ >= 200) continue;
        const rowData = row.data as CatalogRowData;
        const { items: existing } = await listCatalogItems(input.businessId, { query: rowData.sku, limit: 5 });
        const current = existing.find(item => item.sku.toLowerCase() === rowData.sku.toLowerCase());
        if (current) rowData.existing = { itemId: current.id, priceMinor: current.priceMinor, name: current.name };
      }
    }
    await progress(Math.min(start + batch.length, candidates.length), candidates.length);
  }
}

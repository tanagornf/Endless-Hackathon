import { db } from '../../core';
import { requireImport } from './repo';

const formulaPrefix = /^[\s\uFEFF]*[=+\-@]|^[\t\r\n]/u;
export function encodeCsvField(value: string): string {
  const safe = formulaPrefix.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export async function buildErrorsCsv(businessId: string, id: string): Promise<Uint8Array> {
  const record = await requireImport(businessId, id);
  const { rows } = await db.query<{ row_no: number; error_column: string | null; error_code: string; error_message: string | null; raw: string[] }>(
    `SELECT row_no,error_column,error_code,error_message,raw FROM import_rows
      WHERE business_id=$1 AND import_id=$2 AND status='error' ORDER BY row_no`, [businessId, id]);
  const lines = [['row_no', 'column', 'code', 'message', ...(record.header ?? [])].map(encodeCsvField).join(',')];
  for (const row of rows) {
    lines.push([String(row.row_no), row.error_column ?? '', row.error_code, row.error_message ?? '',
      ...(record.header ?? []).map((_, index) => row.raw[index] ?? '')].map(encodeCsvField).join(','));
  }
  return Buffer.from('\uFEFF' + lines.join('\r\n') + '\r\n', 'utf8');
}

import { z } from 'zod';
import type { Page } from '@nless/shared/core/types';
import type {
  DetectedMapping, ImportData, ImportKind, ImportMapping, ImportOptions, ImportPhase,
  ImportRowStatus, ImportRowView, ImportState, ImportTarget, ImportTimings, ImportView,
} from '@nless/shared/features/knowledge-import/types';
import { AppError, db, jobs, publish, type DbExecutor } from '../../core';
import { IMPORT_JOB } from './config';
import type { CheckedRow, RawRow } from './validate';

export type ImportStep = 'parse' | 'validate' | 'extract' | 'commit';
export type ImportPayload = { importId: string; step: ImportStep; runSeq: number };
export type StoredTimings = Partial<Pick<ImportTimings, 'uploadedAt' | 'parsedAt' | 'readyAt' | 'commitStartedAt' | 'committedAt'>>;

export interface ImportRecord {
  id: string;
  business_id: string;
  kind: ImportKind;
  target: ImportTarget | null;
  state: ImportState;
  phase: ImportPhase | null;
  source_label: string;
  source_key: string;
  source_url: string | null;
  file_id: string | null;
  sha256: string;
  size_bytes: number;
  version_id: string | null;
  version: number | null;
  duplicate_of_import_id: string | null;
  duplicate_version: number | null;
  options: ImportOptions & { detected?: DetectedMapping };
  header: string[] | null;
  mapping: ImportMapping | null;
  rows_total: number;
  rows_ready: number;
  rows_error: number;
  rows_excluded: number;
  rows_written: number;
  rows_updated: number;
  rows_skipped: number;
  warnings: ImportView['warnings'];
  moderation_flagged: boolean;
  error_code: string | null;
  error_message: string | null;
  created_by: string | null;
  created_at: Date;
  creation_key: string;
  timings: StoredTimings;
  run_seq: number;
  job_id: string | null;
}

export interface RowRecord {
  id: string;
  row_no: number;
  raw: string[];
  status: ImportRowStatus;
  data: ImportData | null;
  error_code: string | null;
  error_column: string | null;
  error_message: string | null;
  warnings: ImportRowView['warnings'];
  created_ref: string | null;
}

const columns = 'j.*, j.created_at::text AS creation_key, v.version, d.version AS duplicate_version';
const from = `FROM import_jobs j
  LEFT JOIN knowledge_source_versions v ON v.id=j.version_id AND v.business_id=j.business_id
  LEFT JOIN knowledge_source_versions d ON d.import_id=j.duplicate_of_import_id AND d.business_id=j.business_id AND d.complete`;

export function lookupImport(businessId: string, id: string, tx: DbExecutor = db, lock = false): Promise<ImportRecord | null> {
  return tx.maybeOne<ImportRecord>(`SELECT ${columns} ${from}
    WHERE j.business_id=$1 AND j.id=$2 ${lock ? 'FOR UPDATE OF j' : ''}`, [businessId, id]);
}

export async function requireImport(businessId: string, id: string, tx: DbExecutor = db, lock = false): Promise<ImportRecord> {
  const found = await lookupImport(businessId, id, tx, lock);
  if (!found) throw new AppError('NOT_FOUND', 'Import not found');
  return found;
}

function decodeCursor<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid import cursor');
  }
}
const encodeCursor = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const importCursor = z.object({
  createdAt: z.string().max(45).refine(value => Number.isFinite(Date.parse(value))),
  id: z.string().uuid(),
});
const rowCursor = z.object({ rowNo: z.number().int().min(1).max(2147483647) });

export async function listImportRecords(businessId: string, query: { cursor?: string; limit: number }): Promise<{ records: ImportRecord[]; nextCursor: string | null }> {
  const before = query.cursor ? decodeCursor(query.cursor, importCursor) : null;
  const { rows } = await db.query<ImportRecord>(`SELECT ${columns} ${from}
    WHERE j.business_id=$1 AND ($2::timestamptz IS NULL OR (j.created_at,j.id) < ($2,$3::uuid))
    ORDER BY j.created_at DESC,j.id DESC LIMIT $4`, [businessId, before?.createdAt ?? null, before?.id ?? null, query.limit + 1]);
  const records = rows.slice(0, query.limit);
  const tail = records.at(-1);
  return { records, nextCursor: tail && rows.length > query.limit ? encodeCursor({ createdAt: tail.creation_key, id: tail.id }) : null };
}

export async function listImportRows(record: ImportRecord, query: { cursor?: string; limit: number; status?: ImportRowStatus }): Promise<Page<ImportRowView>> {
  const after = query.cursor ? decodeCursor(query.cursor, rowCursor).rowNo : 0;
  const { rows } = await db.query<RowRecord>(`SELECT id,row_no,raw,status,data,error_code,error_column,error_message,warnings,created_ref
    FROM import_rows WHERE business_id=$1 AND import_id=$2 AND row_no>$3 AND ($4::text IS NULL OR status=$4)
    ORDER BY row_no LIMIT $5`, [record.business_id, record.id, after, query.status ?? null, query.limit + 1]);
  const items = rows.slice(0, query.limit).map(row => asRowView(record, row));
  const tail = items.at(-1);
  return { items, nextCursor: tail && rows.length > query.limit ? encodeCursor({ rowNo: tail.rowNo }) : null };
}

export function asRowView(record: ImportRecord, row: RowRecord): ImportRowView {
  return {
    id: row.id, rowNo: row.row_no, data: row.data, status: row.status, target: record.target,
    cells: record.kind === 'csv' || record.kind === 'xlsx' ? row.raw.slice(0, 12) : null,
    error: row.error_code ? { code: row.error_code, column: row.error_column, message: row.error_message ?? '' } : null,
    warnings: row.warnings, createdRef: row.created_ref,
  };
}

const duration = (first?: string | null, last?: string | null): number | null =>
  first && last ? Date.parse(last) - Date.parse(first) : null;

export async function asImportView(record: ImportRecord, withProgress = true): Promise<ImportView> {
  const { uploadedAt = record.created_at.toISOString(), parsedAt = null, readyAt = null, commitStartedAt = null, committedAt = null } = record.timings;
  const { detected, ...options } = record.options;
  const latest = withProgress && record.job_id ? await jobs.get(record.job_id) : null;
  return {
    id: record.id, kind: record.kind, target: record.target, state: record.state, phase: record.phase,
    sourceLabel: record.source_label, sourceUrl: record.source_url, sizeBytes: record.size_bytes,
    progress: latest?.progress ?? null, header: record.header, mapping: record.mapping, detected: detected ?? null, options,
    counts: {
      total: record.rows_total, ready: record.rows_ready, error: record.rows_error, excluded: record.rows_excluded,
      written: record.rows_written, updated: record.rows_updated, skipped: record.rows_skipped,
    },
    duplicate: record.duplicate_of_import_id && record.duplicate_version != null
      ? { importId: record.duplicate_of_import_id, version: record.duplicate_version } : null,
    version: record.version, warnings: record.warnings, moderationFlagged: record.moderation_flagged,
    error: record.error_code ? { code: record.error_code, message: record.error_message ?? '' } : null,
    timings: {
      uploadedAt, parsedAt, readyAt, commitStartedAt, committedAt,
      parseMs: duration(uploadedAt, parsedAt), reviewMs: duration(parsedAt, readyAt),
      commitMs: duration(commitStartedAt, committedAt), totalMs: duration(uploadedAt, committedAt),
    },
    createdBy: record.created_by, createdAt: record.created_at.toISOString(),
  };
}

export function publishImport(businessId: string, id: string): void {
  publish(businessId, { type: 'custom', featureId: 'F06', name: 'imports.changed', data: { id } });
}

/** The persisted state is the enqueue intent. A sweep can reconcile an interrupted enqueue. */
export async function ensureImportJob(businessId: string, importId: string, step: ImportStep, runSeq: number): Promise<void> {
  const payload: ImportPayload = { importId, step, runSeq };
  const { jobId } = await jobs.enqueue(IMPORT_JOB, payload, {
    businessId, dedupKey: `${IMPORT_JOB}:${importId}:${step}:${runSeq}`, lockKey: `knowledge-import:${importId}`, maxAttempts: 3,
  });
  await db.query('UPDATE import_jobs SET job_id=$4 WHERE business_id=$1 AND id=$2 AND run_seq=$3 AND job_id IS NULL',
    [businessId, importId, runSeq, jobId]);
}

export async function storeRawRows(tx: DbExecutor, record: ImportRecord, batch: RawRow[]): Promise<void> {
  await tx.query(`INSERT INTO import_rows (import_id,business_id,row_no,raw)
    SELECT $2,$1,row_no,raw FROM jsonb_to_recordset($3::jsonb) AS input(row_no integer,raw jsonb)
    ON CONFLICT (import_id,row_no) DO UPDATE SET raw=EXCLUDED.raw
    WHERE import_rows.business_id=$1`, [record.business_id, record.id, JSON.stringify(batch.map(row => ({ row_no: row.rowNo, raw: row.raw })))]);
}

export async function storeCheckedRows(tx: DbExecutor, record: ImportRecord, batch: CheckedRow[]): Promise<void> {
  if (!batch.length) return;
  const payload = batch.map(row => ({
    row_no: row.rowNo, status: row.status, data: row.data, code: row.error?.code ?? null,
    error_column: row.error?.column ?? null, message: row.error?.message ?? null, warnings: row.warnings, created_ref: row.createdRef ?? null,
  }));
  await tx.query(`INSERT INTO import_rows (import_id,business_id,row_no,status,data,error_code,error_column,error_message,warnings,created_ref)
    SELECT $2,$1,row_no,status,data,code,error_column,message,warnings,created_ref
    FROM jsonb_to_recordset($3::jsonb) AS r(row_no integer,status text,data jsonb,code text,error_column text,message text,warnings jsonb,created_ref text)
    ON CONFLICT (import_id,row_no) DO UPDATE SET
      status=EXCLUDED.status,data=EXCLUDED.data,error_code=EXCLUDED.error_code,error_column=EXCLUDED.error_column,
      error_message=EXCLUDED.error_message,warnings=EXCLUDED.warnings,created_ref=EXCLUDED.created_ref,updated_at=now()
    WHERE import_rows.business_id=$1`, [record.business_id, record.id, JSON.stringify(payload)]);
}

export async function refreshCounts(tx: DbExecutor, record: ImportRecord): Promise<void> {
  await tx.query(`UPDATE import_jobs SET
      rows_total=c.total,rows_ready=c.ready,rows_error=c.error,rows_excluded=c.excluded,
      rows_written=c.written,rows_updated=c.updated,rows_skipped=c.skipped,updated_at=now()
    FROM (SELECT count(*) AS total, count(*) FILTER (WHERE status='ready') AS ready,
      count(*) FILTER (WHERE status='error') AS error, count(*) FILTER (WHERE status='excluded') AS excluded,
      count(*) FILTER (WHERE status='written') AS written, count(*) FILTER (WHERE status='updated') AS updated,
      count(*) FILTER (WHERE status='skipped') AS skipped
      FROM import_rows WHERE business_id=$1 AND import_id=$2) c
    WHERE import_jobs.business_id=$1 AND import_jobs.id=$2`, [record.business_id, record.id]);
}

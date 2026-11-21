import { AppError, db, storage, type JobHandler, type JobContext } from '../../core';
import { CATALOG_CHUNK } from './config';
import { parseCsv } from './csv';
import { decodeImportText } from './decode';
import { detectMapping } from './detect';
import { ensureImportJob, lookupImport, publishImport, refreshCounts, storeCheckedRows, storeRawRows } from './repo';
import type { ImportPayload, ImportRecord, ImportStep } from './repo';
import { checkCatalogPreview, checkRows } from './validate';

type ImportJob = JobContext<ImportPayload>;
const jobKeys = (record: ImportRecord) => [record.business_id, record.id, record.run_seq] as const;
const errors: Record<string, string> = {
  invalid_encoding: 'The file encoding is unsupported',
  empty_file: 'The file has no rows',
  too_many_rows: 'The file has more than 2,000 data rows',
  csv_unparsable: 'The CSV could not be parsed',
  file_missing: 'The uploaded file could not be found',
  job_dead: 'The background import stopped',
};

async function fail(record: ImportRecord, reason: string) {
  await db.query(`UPDATE import_jobs SET state='failed',phase=NULL,error_code=$4,error_message=$5,updated_at=now()
    WHERE business_id=$1 AND id=$2 AND run_seq=$3 AND state IN ('parsing','validating')`,
    [...jobKeys(record), reason, errors[reason] ?? errors.job_dead]);
  publishImport(record.business_id, record.id);
}

async function parseImport(record: ImportRecord, job: ImportJob) {
  const { rowCount } = await db.query(`UPDATE import_jobs SET state='parsing',phase='read',updated_at=now()
    WHERE business_id=$1 AND id=$2 AND run_seq=$3 AND state IN ('queued','parsing')`, jobKeys(record));
  if (!rowCount) return;
  publishImport(record.business_id, record.id);
  const file = record.file_id && await storage.read(record.file_id, { businessId: record.business_id }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
  if (!file) return fail(record, 'file_missing');
  const { header, rows } = parseCsv(decodeImportText(file.bytes), record.options);
  for (let offset = 0; offset < rows.length; offset += CATALOG_CHUNK) {
    if (job.signal.aborted) throw job.signal.reason;
    const batch = rows.slice(offset, offset + CATALOG_CHUNK);
    await storeRawRows(db, record, batch);
    await job.progress(offset + batch.length, rows.length);
  }
  const detected = detectMapping(header);
  await db.query(`UPDATE import_jobs SET
    header=$4,options=options || $5::jsonb,rows_total=$6,target=$7,state='awaiting_mapping',phase=NULL,
    timings=timings || jsonb_build_object('parsedAt',$8::text),updated_at=now()
    WHERE business_id=$1 AND id=$2 AND run_seq=$3 AND state='parsing'`,
    [...jobKeys(record), JSON.stringify(header), JSON.stringify({ detected }), rows.length, detected.target, new Date().toISOString()]);
  publishImport(record.business_id, record.id);
}

async function validateImport(record: ImportRecord, job: ImportJob) {
  if (record.state !== 'validating' || !record.header || !record.mapping || (record.target !== 'catalog' && record.target !== 'faq')) return;
  const { rows } = await db.query<{ row_no: number; raw: string[] }>(`SELECT row_no,raw FROM import_rows
    WHERE business_id=$1 AND import_id=$2 ORDER BY row_no`, [record.business_id, record.id]);
  const checked = checkRows(rows.map(row => ({ rowNo: row.row_no, raw: row.raw })), record.header, record.target, record.mapping);
  if (record.target === 'catalog') {
    await checkCatalogPreview({
      rows: checked, businessId: record.business_id, importId: record.id, actorUserId: record.created_by,
      mode: record.options.catalogMode, priceColumn: record.header[record.mapping.catalog?.price ?? -1] ?? null,
      skuColumn: record.header[record.mapping.catalog?.sku ?? -1] ?? null,
    }, async () => { if (job.signal.aborted) throw job.signal.reason; });
  }
  // Keep preview rows and counters consistent if a validation attempt retries.
  await db.tx(async tx => {
    for (let offset = 0; offset < checked.length; offset += CATALOG_CHUNK) {
      await storeCheckedRows(tx, record, checked.slice(offset, offset + CATALOG_CHUNK));
    }
    await refreshCounts(tx, record);
    await tx.query(`UPDATE import_jobs SET state='review',phase=NULL,timings=timings || jsonb_build_object('readyAt',$4::text),updated_at=now()
      WHERE business_id=$1 AND id=$2 AND run_seq=$3 AND state='validating'`, [...jobKeys(record), new Date().toISOString()]);
  });
  await job.progress(checked.length, checked.length);
  publishImport(record.business_id, record.id);
}

export const runImport: JobHandler<ImportPayload> = async job => {
  if (!job.businessId) return;
  const record = await lookupImport(job.businessId, job.payload.importId);
  if (!record || record.run_seq !== job.payload.runSeq ||
      !await db.maybeOne('SELECT 1 FROM businesses WHERE id=$1 AND status=\'active\'', [job.businessId])) return;
  try {
    if (job.payload.step === 'parse') await parseImport(record, job);
    if (job.payload.step === 'validate') await validateImport(record, job);
  } catch (error) {
    const reason = error instanceof AppError && error.code === 'VALIDATION_ERROR' ? error.details?.reason : null;
    if (typeof reason === 'string' && Object.hasOwn(errors, reason)) return fail(record, reason);
    if (job.attempt >= job.maxAttempts) await fail(record, 'job_dead');
    throw error;
  }
};

export const sweepImports: JobHandler = async () => {
  const pending = await db.query<{ business_id: string; id: string; run_seq: number; state: string }>(`SELECT i.business_id,i.id,i.run_seq,i.state
    FROM import_jobs i JOIN businesses b ON b.id=i.business_id AND b.status='active'
    WHERE i.job_id IS NULL AND i.state IN ('queued','parsing','validating') ORDER BY i.updated_at LIMIT 100`);
  for (const record of pending.rows) {
    const step: ImportStep = record.state === 'validating' ? 'validate' : 'parse';
    await ensureImportJob(record.business_id, record.id, step, record.run_seq);
  }
  const { rows } = await db.query<{ business_id: string; id: string }>(`UPDATE import_jobs i SET
    state=CASE WHEN i.state IN ('queued','awaiting_mapping','review') THEN 'cancelled' ELSE 'failed' END,
    error_code=CASE WHEN i.state IN ('parsing','validating') THEN 'job_dead' ELSE NULL END,
    phase=NULL,updated_at=now()
    WHERE (i.state IN ('queued','awaiting_mapping','review') AND i.updated_at < now()-interval '7 days')
       OR (i.state IN ('parsing','validating') AND EXISTS (
         SELECT 1 FROM jobs j WHERE j.id=i.job_id AND j.business_id=i.business_id AND j.state IN ('dead','cancelled','failed')
       ))
    RETURNING i.business_id,i.id`);
  for (const record of rows) publishImport(record.business_id, record.id);
};

import type { ImportView } from '@nless/shared/features/knowledge-import/types';
import { AppError, db, model, storage, type JobHandler, type JobContext } from '../../core';
import { CATALOG_CHUNK } from './config';
import { parseCsv } from './csv';
import { decodeImportText, truncateCodePoints } from './decode';
import { detectMapping } from './detect';
import { ensureImportJob, lookupImport, publishImport, refreshCounts, storeCheckedRows, storeRawRows } from './repo';
import type { ImportPayload, ImportRecord, ImportStep } from './repo';
import { checkCatalogPreview, checkRows, type CheckedRow } from './validate';
import { writeImport } from './commit';
import { extractFaqRows } from './extract';
import { MAX_TEXT_CHARS, prepareArticles } from './text';

type ImportJob = JobContext<ImportPayload>;
const jobKeys = (record: ImportRecord) => [record.business_id, record.id, record.run_seq] as const;
const errors: Record<string, string> = {
  invalid_encoding: 'The file encoding is unsupported',
  empty_file: 'The file has no rows',
  too_many_rows: 'The file has more than 2,000 data rows',
  csv_unparsable: 'The CSV could not be parsed',
  file_missing: 'The uploaded file could not be found',
  job_dead: 'The background import stopped',
  extraction_failed: 'FAQ extraction could not use any source section',
  provider_budget: 'The AI provider usage credit is exhausted',
};

async function fail(record: ImportRecord, reason: string) {
  await db.query(`UPDATE import_jobs SET state='failed',phase=NULL,error_code=$4,error_message=$5,updated_at=now()
    WHERE business_id=$1 AND id=$2 AND run_seq=$3 AND state IN ('parsing','validating','extracting','committing')`,
    [...jobKeys(record), reason, errors[reason] ?? errors.job_dead]);
  publishImport(record.business_id, record.id);
}

async function parseImport(record: ImportRecord, job: ImportJob) {
  const { rowCount } = await db.query(`UPDATE import_jobs SET state='parsing',phase='read',updated_at=now()
    WHERE business_id=$1 AND id=$2 AND run_seq=$3 AND state IN ('queued','parsing')`, jobKeys(record));
  if (!rowCount) return;
  publishImport(record.business_id, record.id);
  const file = await readSource(record);
  if (!file) return fail(record, 'file_missing');
  if (record.kind === 'text') return parseText(record, file.bytes, job);
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

async function readSource(record: ImportRecord) {
  if (!record.file_id) return null;
  return storage.read(record.file_id, { businessId: record.business_id }).catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  });
}

function extractSource(bytes: Uint8Array) {
  const fullText = decodeImportText(bytes);
  const text = truncateCodePoints(fullText, MAX_TEXT_CHARS);
  const warnings: ImportView['warnings'] = text.length < fullText.length ? [{ code: 'text_truncated' }] : [];
  return { text, warnings };
}

async function storeTextResult(record: ImportRecord, target: 'faq' | 'article', rows: CheckedRow[],
  warnings: ImportView['warnings']): Promise<void> {
  await db.tx(async tx => {
    await storeCheckedRows(tx, record, rows);
    await refreshCounts(tx, record);
    await tx.query(`UPDATE import_jobs SET state='review',target=$4,phase=NULL,warnings=$5,
      timings=timings || jsonb_build_object('readyAt',$6::text),updated_at=now()
      WHERE business_id=$1 AND id=$2 AND run_seq=$3`,
      [...jobKeys(record), target, JSON.stringify(warnings), new Date().toISOString()]);
  });
  publishImport(record.business_id, record.id);
}

async function parseText(record: ImportRecord, bytes: Uint8Array, job: ImportJob): Promise<void> {
  const { text, warnings } = extractSource(bytes);
  if (!text.trim()) { await fail(record, 'empty_file'); return; }
  const fragment = text.length <= 6_000 ? text : truncateCodePoints(text, 3_000) + '\n' + [...text].slice(-3_000).join('');
  const moderation = await model.moderate({
    text: fragment, usage: { businessId: record.business_id, featureId: 'F06', purpose: 'moderate' },
  }).catch(() => null);
  if (job.signal.aborted) throw job.signal.reason;
  if (moderation?.flagged) warnings.push({ code: 'moderation_flagged' });

  const parsedAt = new Date().toISOString();
  if (record.options.mode === 'as_article') {
    const articles = prepareArticles(text, record.source_label);
    if (articles.truncated && !warnings.some(item => item.code === 'text_truncated')) warnings.push({ code: 'text_truncated' });
    await db.query(`UPDATE import_jobs SET moderation_flagged=$4,
      timings=timings || jsonb_build_object('parsedAt',$5::text),updated_at=now()
      WHERE business_id=$1 AND id=$2 AND run_seq=$3`, [...jobKeys(record), moderation?.flagged ?? false, parsedAt]);
    await storeTextResult(record, 'article', articles.rows, warnings);
    await job.progress(articles.rows.length, articles.rows.length);
    return;
  }

  const next = await db.one<{ run_seq: number }>(`UPDATE import_jobs SET state='extracting',phase='chunk',target='faq',
    run_seq=run_seq+1,job_id=NULL,moderation_flagged=$4,warnings=$5,
    timings=timings || jsonb_build_object('parsedAt',$6::text),updated_at=now()
    WHERE business_id=$1 AND id=$2 AND run_seq=$3 RETURNING run_seq`,
    [...jobKeys(record), moderation?.flagged ?? false, JSON.stringify(warnings), parsedAt]);
  await ensureImportJob(record.business_id, record.id, 'extract', next.run_seq);
  publishImport(record.business_id, record.id);
}

async function extractImport(record: ImportRecord, job: ImportJob): Promise<void> {
  if (record.state !== 'extracting') return;
  const file = await readSource(record);
  if (!file) { await fail(record, 'file_missing'); return; }
  await db.query(`UPDATE import_jobs SET phase='extract',updated_at=now()
    WHERE business_id=$1 AND id=$2 AND run_seq=$3`, jobKeys(record));
  publishImport(record.business_id, record.id);
  const { text } = extractSource(file.bytes);
  const result = await extractFaqRows({
    businessId: record.business_id, text, chat: model.chat, signal: job.signal, progress: job.progress,
  });
  if (result.failed) { await fail(record, 'extraction_failed'); return; }
  const known = new Set(record.warnings.map(item => item.code));
  await storeTextResult(record, 'faq', result.rows, [...record.warnings, ...result.warnings.filter(item => !known.has(item.code))]);
}

async function validateImport(record: ImportRecord, job: ImportJob) {
  if (record.state !== 'validating' || !record.header || !record.mapping || (record.target !== 'catalog' && record.target !== 'faq')) return;
  const { rows } = await db.query<{ row_no: number; raw: string[] }>(`SELECT row_no,raw FROM import_rows
    WHERE business_id=$1 AND import_id=$2 ORDER BY row_no`, [record.business_id, record.id]);
  const checked = checkRows(rows.map(row => ({ rowNo: row.row_no, raw: row.raw })), record.header, record.target, record.mapping);
  if (record.target === 'catalog') {
    await checkCatalogPreview({
      rows: checked, businessId: record.business_id, importId: record.id, actorUserId: record.created_by,
      mode: record.options.catalogMode, mapping: record.mapping.catalog ?? {}, priceColumn: record.header[record.mapping.catalog?.price ?? -1] ?? null,
      skuColumn: record.header[record.mapping.catalog?.sku ?? -1] ?? null,
    }, async (done, total) => {
      if (job.signal.aborted) throw job.signal.reason;
      await job.progress(checked.length - total + done, checked.length);
    });
  }
  if (job.signal.aborted) throw job.signal.reason;
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
    if (job.payload.step === 'extract') await extractImport(record, job);
    if (job.payload.step === 'commit') await writeImport(record, job);
  } catch (error) {
    if (error instanceof AppError && error.code === 'PROVIDER_BUDGET_EXHAUSTED') return fail(record, 'provider_budget');
    const reason = error instanceof AppError && error.code === 'VALIDATION_ERROR' ? error.details?.reason : null;
    if (typeof reason === 'string' && Object.hasOwn(errors, reason)) return fail(record, reason);
    if (job.attempt >= job.maxAttempts) await fail(record, 'job_dead');
    throw error;
  }
};

export const sweepImports: JobHandler = async () => {
  const pending = await db.query<{ business_id: string; id: string; run_seq: number; state: string }>(`SELECT i.business_id,i.id,i.run_seq,i.state
    FROM import_jobs i JOIN businesses b ON b.id=i.business_id AND b.status='active'
    WHERE i.job_id IS NULL AND i.state IN ('queued','parsing','validating','extracting','committing') ORDER BY i.updated_at LIMIT 100`);
  for (const record of pending.rows) {
    const step: ImportStep = record.state === 'validating' ? 'validate' : record.state === 'extracting' ? 'extract' :
      record.state === 'committing' ? 'commit' : 'parse';
    await ensureImportJob(record.business_id, record.id, step, record.run_seq);
  }
  const { rows } = await db.query<{ business_id: string; id: string }>(`UPDATE import_jobs i SET
    state=CASE WHEN i.state IN ('queued','awaiting_mapping','review') THEN 'cancelled' ELSE 'failed' END,
    error_code=CASE WHEN i.state IN ('parsing','validating','extracting','committing') THEN 'job_dead' ELSE NULL END,
    phase=NULL,updated_at=now()
    WHERE (i.state IN ('queued','awaiting_mapping','review') AND i.updated_at < now()-interval '7 days')
       OR (i.state IN ('parsing','validating','extracting','committing') AND EXISTS (
         SELECT 1 FROM jobs j WHERE j.id=i.job_id AND j.business_id=i.business_id AND j.state IN ('dead','cancelled','failed')
       ))
    RETURNING i.business_id,i.id`);
  for (const record of rows) publishImport(record.business_id, record.id);
};

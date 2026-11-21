import { randomUUID } from 'node:crypto';
import type { Page } from '@nless/shared/core/types';
import type { ImportKind, ImportOptions, ImportView } from '@nless/shared/features/knowledge-import/types';
import type { z } from 'zod';
import { AppError, auditInTransaction, db, storage, type UploadedFile } from '../../core';
import { MAX_BYTES, PARSER_VERSION } from './config';
import { requiredFields } from './detect';
import { asImportView, asRowView, ensureImportJob, listImportRecords, listImportRows, publishImport, refreshCounts, requireImport, type RowRecord } from './repo';
import { defaultOptions, type ListQuery, type MappingBody, type PatchRowBody, type RowsQuery, type TextImportBody } from './schemas';

export const FEATURE = { id: 'F06', slug: 'knowledge-import', lane: 'B3' } as const;

export async function listImports(businessId: string, query: z.infer<typeof ListQuery>): Promise<Page<ImportView>> {
  const { records, nextCursor } = await listImportRecords(businessId, query);
  return { items: await Promise.all(records.map(record => asImportView(record, false))), nextCursor };
}

export async function getImport(businessId: string, id: string): Promise<ImportView> {
  return asImportView(await requireImport(businessId, id));
}

export async function listRows(businessId: string, id: string, query: z.infer<typeof RowsQuery>) {
  return listImportRows(await requireImport(businessId, id), query);
}

function invalid(reason: string, message: string): never {
  throw new AppError('VALIDATION_ERROR', message, { details: { reason } });
}

export function validateUpload(file: UploadedFile): { label: string; kind: 'csv' | 'text'; delimiter?: '\t' } {
  if (!file.bytes.length) invalid('empty_file', 'The import file is empty');
  if (file.bytes.length > MAX_BYTES) invalid('too_large', 'The import file is too large');
  let name = file.originalName;
  // Multipart filenames arrive as Latin-1 from the upload parser. Preserve genuine Latin-1 when UTF-8 decoding fails.
  if (/^[\x00-\xff]*$/u.test(name)) {
    try { name = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(name, 'latin1')); } catch { /* keep original */ }
  }
  const label = name.split(/[/\\]/u).at(-1)?.trim() ?? '';
  if (label.length > 255 || !/\.(csv|tsv|txt|md)$/iu.test(label)) invalid('file_type', 'Choose CSV, TSV, TXT or Markdown');
  const [first, second] = file.bytes;
  const unicodeBom = (first === 0xff && second === 0xfe) || (first === 0xfe && second === 0xff);
  if (!unicodeBom && file.bytes.subarray(0, 8192).includes(0)) invalid('file_type', 'The import file does not contain text');
  return { label, kind: /\.(txt|md)$/iu.test(label) ? 'text' : 'csv', delimiter: /\.tsv$/iu.test(label) ? '\t' : undefined };
}

export async function createFileImport(businessId: string, actorUserId: string, file: UploadedFile, options: ImportOptions): Promise<ImportView> {
  const { label, kind, delimiter } = validateUpload(file);
  const mimeType = kind === 'text' ? 'text/plain' : delimiter ? 'text/tab-separated-values' : 'text/csv';
  return createImport({
    businessId, actorUserId, kind, label, sourceKey: 'file:' + label.toLowerCase(), mimeType, bytes: file.bytes,
    options: { ...options, delimiter: options.delimiter ?? delimiter },
  });
}

export async function createTextImport(businessId: string, actorUserId: string, body: z.infer<typeof TextImportBody>): Promise<ImportView> {
  return createImport({
    businessId, actorUserId, kind: 'text', label: body.label, sourceKey: 'text:' + body.label.toLowerCase(), mimeType: 'text/plain',
    bytes: Buffer.from(body.text), options: { ...defaultOptions, ...body.options },
  });
}

async function createImport(input: {
  businessId: string; actorUserId: string; kind: Extract<ImportKind, 'csv' | 'text'>;
  label: string; sourceKey: string; mimeType: string; bytes: Uint8Array; options: ImportOptions;
}): Promise<ImportView> {
  const { businessId, actorUserId, kind, label, sourceKey, mimeType, bytes, options } = input;
  const stored = await storage.save({ businessId, uploadedBy: actorUserId, purpose: 'import', originalName: label, mimeType, bytes });
  const id = randomUUID();
  await db.tx(async tx => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['f06:source:' + businessId + ':' + sourceKey]);
    const previous = await tx.maybeOne<{ import_id: string }>(`SELECT import_id FROM knowledge_source_versions
      WHERE business_id=$1 AND source_key=$2 AND sha256=$3 AND complete ORDER BY version DESC LIMIT 1`, [businessId, sourceKey, stored.sha256]);
    const version = await tx.one<{ id: string }>(`INSERT INTO knowledge_source_versions (business_id,source_key,version,import_id,sha256,parser_version)
      SELECT $1,$2,COALESCE(max(version),0)+1,$3,$4,$5 FROM knowledge_source_versions WHERE business_id=$1 AND source_key=$2 RETURNING id`,
      [businessId, sourceKey, id, stored.sha256, PARSER_VERSION]);
    await tx.query(`INSERT INTO import_jobs
        (id,business_id,kind,source_label,source_key,file_id,sha256,size_bytes,version_id,duplicate_of_import_id,options,created_by,timings,run_seq)
      VALUES ($1,$2,$13,$3,$4,$5,$6,$7,$8,$9,$10,$11,jsonb_build_object('uploadedAt',$12::text),1)`,
      [id, businessId, label, sourceKey, stored.id, stored.sha256, stored.sizeBytes, version.id, previous?.import_id ?? null,
        JSON.stringify(options), actorUserId, new Date().toISOString(), kind]);
    await auditInTransaction(tx, [{
      action: 'knowledge-import.create', actorUserId, businessId, targetType: 'import', targetId: id,
      details: { kind, sha256: stored.sha256, sizeBytes: stored.sizeBytes },
    }]);
  });
  await ensureImportJob(businessId, id, 'parse', 1);
  publishImport(businessId, id);
  return getImport(businessId, id);
}

export async function submitMapping(businessId: string, id: string, actorUserId: string, body: z.infer<typeof MappingBody>): Promise<ImportView> {
  const runSeq = await db.tx(async tx => {
    const current = await requireImport(businessId, id, tx, true);
    if (current.kind !== 'csv' || (current.state !== 'awaiting_mapping' && current.state !== 'review')) {
      throw new AppError('POLICY_BLOCKED', 'This import is not ready for a mapping', { details: { reason: 'wrong_state' } });
    }
    const header = current.header ?? [];
    const fields = new Map<string, number>(Object.entries(body.mapping[body.target] ?? {}));
    const indexes = [...fields.values()];
    if (!requiredFields[body.target].every(field => fields.has(field)) ||
      indexes.some(index => index >= header.length) || new Set(indexes).size !== indexes.length) {
      invalid('mapping_invalid', 'Map the required fields to different columns in this file');
    }
    const { run_seq } = await tx.one<{ run_seq: number }>(`UPDATE import_jobs SET target=$3,mapping=$4,
      options=options || $5::jsonb, state='validating',phase='validate',job_id=NULL,run_seq=run_seq+1,
      timings=timings - 'readyAt',updated_at=now()
      WHERE business_id=$1 AND id=$2 RETURNING run_seq`,
      [businessId, id, body.target, JSON.stringify(body.mapping), JSON.stringify(body.options ?? {})]);
    await auditInTransaction(tx, [{
      action: 'knowledge-import.mapping', actorUserId, businessId, targetType: 'import', targetId: id,
      details: { target: body.target, mapped: fields.size },
    }]);
    return run_seq;
  });
  await ensureImportJob(businessId, id, 'validate', runSeq);
  publishImport(businessId, id);
  return getImport(businessId, id);
}

export async function cancelImport(businessId: string, id: string, actorUserId: string): Promise<ImportView> {
  await db.tx(async tx => {
    await requireImport(businessId, id, tx, true);
    const { rowCount } = await tx.query(`UPDATE import_jobs SET state='cancelled',phase=NULL,updated_at=now()
      WHERE business_id=$1 AND id=$2 AND state IN ('queued','awaiting_mapping','review')`, [businessId, id]);
    if (!rowCount) throw new AppError('POLICY_BLOCKED', 'This import cannot be cancelled', { details: { reason: 'wrong_state' } });
    await auditInTransaction(tx, [{ action: 'knowledge-import.cancel', actorUserId, businessId, targetType: 'import', targetId: id }]);
  });
  publishImport(businessId, id);
  return getImport(businessId, id);
}

export async function commitImport(businessId: string, id: string, actorUserId: string, allowReimport: boolean): Promise<ImportView> {
  const sequence = await db.tx(async tx => {
    const record = await requireImport(businessId, id, tx, true);
    if (record.state !== 'review') {
      throw new AppError('POLICY_BLOCKED', 'This import is not ready to commit', { details: { reason: 'wrong_state' } });
    }
    if (!record.rows_ready) throw new AppError('POLICY_BLOCKED', 'No rows are ready', { details: { reason: 'no_rows' } });

    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['f06:source:' + businessId + ':' + record.source_key]);
    const duplicate = await tx.maybeOne<{ id: string }>(
      `SELECT id FROM import_jobs WHERE business_id=$1 AND source_key=$2 AND sha256=$3 AND id<>$4
        AND state IN ('committing','done') ORDER BY created_at DESC LIMIT 1`, [businessId, record.source_key, record.sha256, id]);
    if ((record.duplicate_of_import_id || duplicate) && !allowReimport) {
      throw new AppError('POLICY_BLOCKED', 'This source was already imported', {
        details: { reason: 'already_imported', importId: record.duplicate_of_import_id ?? duplicate?.id },
      });
    }
    const updated = await tx.one<{ run_seq: number }>(`UPDATE import_jobs SET state='committing',phase='write',
      run_seq=run_seq+1,job_id=NULL,timings=timings || jsonb_build_object('commitStartedAt',$3::text),
      options=options || jsonb_build_object('allowReimport',$4::boolean),updated_at=now()
      WHERE business_id=$1 AND id=$2 RETURNING run_seq`, [businessId, id, new Date().toISOString(), allowReimport]);
    await auditInTransaction(tx, [{ action: 'knowledge-import.commit_requested', businessId, actorUserId, targetType: 'import', targetId: id }]);
    return updated.run_seq;
  });
  await ensureImportJob(businessId, id, 'commit', sequence);
  publishImport(businessId, id);
  return getImport(businessId, id);
}

export async function patchRow(businessId: string, id: string, rowId: string, actorUserId: string, patch: z.infer<typeof PatchRowBody>) {
  const result = await db.tx(async tx => {
    const record = await requireImport(businessId, id, tx, true);
    if (record.state !== 'review') throw new AppError('POLICY_BLOCKED', 'This import cannot be edited', { details: { reason: 'wrong_state' } });
    const existing = await tx.maybeOne<RowRecord>('SELECT * FROM import_rows WHERE business_id=$1 AND import_id=$2 AND id=$3 FOR UPDATE', [businessId, id, rowId]);
    if (!existing) throw new AppError('NOT_FOUND', 'Import row not found');

    let data = existing.data;
    const { question, answer, title, body, excluded } = patch;
    if (question !== undefined || answer !== undefined) {
      if (!data || !('question' in data) || title !== undefined || body !== undefined) invalid('row_edit', 'Only text rows can be edited');
      data = { ...data, question: question ?? data.question, answer: answer ?? data.answer };
    } else if (title !== undefined || body !== undefined) {
      if (!data || !('title' in data)) invalid('row_edit', 'Only text rows can be edited');
      data = { title: title ?? data.title, body: body ?? data.body };
    }
    let status = existing.status;
    if (excluded && (status === 'ready' || status === 'error')) status = 'excluded';
    if (excluded === false && status === 'excluded') status = existing.error_code ? 'error' : 'ready';
    const row = await tx.one<RowRecord>(`UPDATE import_rows SET data=$4,status=$5,updated_at=now()
      WHERE business_id=$1 AND import_id=$2 AND id=$3 RETURNING *`, [businessId, id, rowId, data ? JSON.stringify(data) : null, status]);
    await refreshCounts(tx, record);
    await auditInTransaction(tx, [{ action: 'knowledge-import.row.update', businessId, actorUserId, targetType: 'import', targetId: id,
      details: { rowNo: row.row_no, status } }]);
    return asRowView(record, row);
  });
  publishImport(businessId, id);
  return result;
}

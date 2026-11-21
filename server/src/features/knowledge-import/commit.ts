import type { CatalogImportResult } from '@nless/shared/features/catalog/types';
import { AppError, auditInTransaction, db, type JobContext } from '../../core';
import { importCatalogItems } from '../catalog/service';
import { createKnowledgeDraft, ensureKnowledgeFolder } from '../knowledge/service';
import { notify } from '../notifications/service';
import { CATALOG_CHUNK } from './config';
import { publishImport, refreshCounts, requireImport, storeCheckedRows, type ImportPayload, type ImportRecord, type RowRecord } from './repo';
import { toCatalogRow, type CheckedRow } from './validate';

function initialRow(row: RowRecord): CheckedRow {
  return { rowNo: row.row_no, status: 'ready', data: row.data, error: null, warnings: row.warnings };
}

function catalogStatus(row: CheckedRow, item: CatalogImportResult['items'][number], error?: CatalogImportResult['errors'][number]): CheckedRow {
  const status = item.action === 'created' ? 'written' : item.action;
  return {
    ...row, status, createdRef: item.itemId,
    error: error ? { code: error.code, column: null, message: error.message.slice(0, 300) } : null,
  };
}

async function commitCatalog(record: ImportRecord, rows: CheckedRow[]): Promise<CheckedRow[]> {
  const result = await importCatalogItems({
    businessId: record.business_id, actorUserId: record.created_by, importId: record.id, rows: rows.map(row => toCatalogRow(row, record.mapping?.catalog)),
    mode: record.options.catalogMode, onError: 'skip_row', dryRun: false,
  });
  if (!result.applied) throw new Error('Catalog import did not apply');
  const items = new Map(result.items.map(item => [item.rowNo, item]));
  const errors = new Map(result.errors.map(error => [error.rowNo, error]));
  return rows.map(row => {
    const item = items.get(row.rowNo);
    if (!item) throw new Error('Catalog response omitted an import row');
    return catalogStatus(row, item, errors.get(row.rowNo));
  });
}

async function commitKnowledge(record: ImportRecord, row: CheckedRow, folders: Map<string, string>): Promise<CheckedRow> {
  const data = row.data;
  if (!data || 'sku' in data) throw new Error('Knowledge import row has no text');
  const kind = 'question' in data ? 'faq' : 'article';
  const title = 'question' in data ? data.question : data.title;
  const body = 'answer' in data ? data.answer : data.body;
  const folderName = ('folder' in data ? data.folder : null) ?? record.options.folderName;
  const folderKey = folderName.trim().toLowerCase();
  try {
    let folderId = folders.get(folderKey);
    if (!folderId) {
      folderId = (await ensureKnowledgeFolder(record.business_id, folderName, record.created_by)).id;
      folders.set(folderKey, folderId);
    }
    const result = await createKnowledgeDraft({
      businessId: record.business_id, kind, title, body, folderId, sourceRef: record.id,
      clientRequestId: record.id + ':' + row.rowNo, actorUserId: record.created_by,
    });
    return { ...row, status: 'written', createdRef: result.itemId, warnings: [...row.warnings, ...result.warnings] };
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'VALIDATION_ERROR') throw error;
    return { ...row, status: 'error', error: { code: 'knowledge_row_invalid', column: null, message: 'The knowledge draft could not be created' } };
  }
}

async function notifyCompletion(record: ImportRecord): Promise<void> {
  if (!record.created_by) return;
  const shop = await db.maybeOne<{ language: 'th' | 'en' }>('SELECT language FROM businesses WHERE id=$1', [record.business_id]);
  const thai = shop?.language !== 'en';
  const count = record.rows_written + record.rows_updated;
  await notify({
    businessId: record.business_id, to: { userIds: [record.created_by] }, type: 'report',
    title: thai ? 'นำเข้าข้อมูลเสร็จแล้ว' : 'Import finished',
    body: thai ? `สำเร็จ ${count} · ข้าม ${record.rows_skipped} · ผิดพลาด ${record.rows_error}`
      : `${count} saved · ${record.rows_skipped} skipped · ${record.rows_error} errors`,
    link: '/imports/' + record.id, dedupKey: 'import:' + record.id + ':done',
  });
}

export async function writeImport(record: ImportRecord, job: JobContext<ImportPayload>): Promise<void> {
  if (record.state === 'done') { await notifyCompletion(record); return; }
  if (record.state !== 'committing') return;

  const already = record.rows_written + record.rows_updated + record.rows_skipped + record.rows_error;
  let done = 0;
  const initial = record.rows_ready;
  const folders = new Map<string, string>();
  for (;;) {
    if (job.signal.aborted) throw job.signal.reason;
    const { rows } = await db.query<RowRecord>(`SELECT * FROM import_rows
      WHERE business_id=$1 AND import_id=$2 AND status='ready' ORDER BY row_no LIMIT $3`,
      [record.business_id, record.id, record.target === 'catalog' ? CATALOG_CHUNK : 10]);
    if (!rows.length) break;
    const normalized = rows.map(initialRow);
    const result: CheckedRow[] = [];
    if (record.target === 'catalog') result.push(...await commitCatalog(record, normalized));
    else {
      for (const row of normalized) {
        if (job.signal.aborted) throw job.signal.reason;
        result.push(await commitKnowledge(record, row, folders));
      }
    }
    await db.tx(async tx => {
      await storeCheckedRows(tx, record, result);
      await refreshCounts(tx, record);
    });
    done += rows.length;
    await job.progress(already + done, already + initial);
  }

  const complete = await db.tx(async tx => {
    await refreshCounts(tx, record);
    const result = await requireImport(record.business_id, record.id, tx, true);
    if (result.state !== 'committing') return result;
    await tx.query(`UPDATE knowledge_source_versions SET complete=true,rows_count=$3
      WHERE business_id=$1 AND id=$2`, [record.business_id, record.version_id, result.rows_written + result.rows_updated]);
    await tx.query(`UPDATE import_jobs SET state='done',phase=NULL,timings=timings || jsonb_build_object('committedAt',$3::text),updated_at=now()
      WHERE business_id=$1 AND id=$2`, [record.business_id, record.id, new Date().toISOString()]);
    await auditInTransaction(tx, [{
      action: 'knowledge-import.commit', actorUserId: record.created_by, businessId: record.business_id, targetType: 'import', targetId: record.id,
      details: { target: result.target, written: result.rows_written, updated: result.rows_updated, skipped: result.rows_skipped, error: result.rows_error },
    }]);
    return result;
  });

  publishImport(record.business_id, record.id);
  await notifyCompletion(complete);
}

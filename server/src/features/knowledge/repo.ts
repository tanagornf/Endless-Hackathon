import { z } from 'zod';
import { AppError, db, storage } from '../../core';
import type { DbExecutor } from '../../core';
import type { Page } from '@nless/shared/core/types';
import type {
  KnowledgeFileTag, KnowledgeIndexView, KnowledgeItemDetail, KnowledgeItemRow,
  KnowledgeModeration, KnowledgeRevisionDetail, KnowledgeRevisionRow,
} from '@nless/shared/features/knowledge/types';
import { normalizeContent } from './hash';
import { getIndexStates } from './index-port';
import type { ListQuery, RevisionQuery } from './schema';

export type FileTag = Pick<KnowledgeFileTag, 'fileId' | 'description' | 'sendToUser' | 'flagged'>;
export interface Item {
  id: string;
  business_id: string;
  kind: KnowledgeItemRow['kind'];
  title: string;
  body: string;
  status: KnowledgeItemRow['status'];
  revision: number;
  folder_id: string | null;
  folder_name?: string | null;
  files: FileTag[];
  source: KnowledgeItemRow['source'];
  content_hash: string;
  moderation: KnowledgeModeration | null;
  created_at: Date;
  updated_at: Date;
  cursor_time?: string;
  updated_by: string | null;
  submitted_at: Date | null;
  activated_at: Date | null;
  deactivated_at: Date | null;
  deleted_at: Date | null;
  deleted_by: string | null;
}

const itemSelect = 'SELECT i.*, f.name AS folder_name, i.updated_at::text AS cursor_time FROM knowledge_items i ' +
  'LEFT JOIN knowledge_folders f ON f.id=i.folder_id AND f.business_id=i.business_id';
const ListCursor = z.object({ updatedAt: z.string().max(40).refine((value) => Number.isFinite(Date.parse(value))), id: z.string().uuid() }).strict();

function listCursor(cursor: string) {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    return ListCursor.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid knowledge cursor');
  }
}

function stateOf(item: Item, states: Record<string, KnowledgeIndexView>): KnowledgeIndexView {
  const state = states[item.id];
  return state?.revision === item.revision
    ? state
    : { revision: item.revision, state: 'not_started', error: null, indexedAt: null };
}

function itemView(item: Item, state: KnowledgeIndexView): Omit<KnowledgeItemRow, 'snippet'> {
  return {
    id: item.id, kind: item.kind, title: item.title, status: item.status,
    revision: item.revision, folderId: item.folder_id, folderName: item.folder_name ?? null,
    indexState: state.state, updatedAt: item.updated_at.toISOString(), source: item.source,
  };
}

export async function listItems(businessId: string, query: ListQuery): Promise<Page<KnowledgeItemRow>> {
  const values: unknown[] = [businessId];
  const filters = ['i.business_id=$1'];
  const bind = (value: unknown) => '$' + values.push(value);
  if (query.status) filters.push('i.status=' + bind(query.status));
  else if (!query.includeDeleted) filters.push("i.status<>'deleted'");
  if (query.kind) filters.push('i.kind=' + bind(query.kind));
  if (query.folderId === 'unfiled') filters.push('i.folder_id IS NULL');
  else if (query.folderId) filters.push('i.folder_id=' + bind(query.folderId));
  if (query.q) {
    const term = bind('%' + query.q.replace(/[!%_]/g, '!$&') + '%');
    filters.push("(i.id::text ILIKE " + term + " ESCAPE '!' OR i.title ILIKE " + term + " ESCAPE '!')");
  }
  if (query.cursor) {
    const cursor = listCursor(query.cursor);
    filters.push('(i.updated_at,i.id) < (' + bind(cursor.updatedAt) + '::timestamptz,' + bind(cursor.id) + '::uuid)');
  }
  const { rows } = await db.query<Item>(itemSelect + ' WHERE ' + filters.join(' AND ') +
    ' ORDER BY i.updated_at DESC,i.id DESC LIMIT ' + bind(query.limit + 1), values);
  const visible = rows.slice(0, query.limit);
  const states = visible.length ? await getIndexStates(businessId, visible.map((item) => item.id)) : {};
  const last = visible.at(-1);
  return {
    items: visible.map((item) => ({ ...itemView(item, stateOf(item, states)), snippet: item.body.slice(0, 160) })),
    nextCursor: rows.length > query.limit && last ?
      Buffer.from(JSON.stringify({ updatedAt: last.cursor_time, id: last.id })).toString('base64url') : null,
  };
}

export function findItem(businessId: string, id: string, executor: DbExecutor = db): Promise<Item | null> {
  if (!z.string().uuid().safeParse(id).success) return Promise.resolve(null);
  return executor.maybeOne<Item>(itemSelect + ' WHERE i.business_id=$1 AND i.id=$2', [businessId, id]);
}

export async function requireItem(businessId: string, id: string, executor: DbExecutor = db): Promise<Item> {
  const item = await findItem(businessId, id, executor);
  if (!item) throw new AppError('NOT_FOUND', 'Knowledge item not found');
  return item;
}

export async function assertFolder(businessId: string, folderId: string | null, tx: DbExecutor): Promise<void> {
  if (!folderId) return;
  const folder = await tx.maybeOne('SELECT id FROM knowledge_folders WHERE business_id=$1 AND id=$2 FOR KEY SHARE',
    [businessId, folderId]);
  if (!folder) throw new AppError('NOT_FOUND', 'Knowledge folder not found');
}

export async function snapshot(tx: DbExecutor, item: Item, actorUserId: string | null): Promise<void> {
  await tx.query(
    'INSERT INTO knowledge_revisions (business_id,item_id,revision,kind,title,body,folder_id,files,created_by) ' +
    'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [item.business_id, item.id, item.revision, item.kind, item.title, item.body,
      item.folder_id, JSON.stringify(item.files), actorUserId],
  );
}

async function duplicateWarnings(item: Item): Promise<KnowledgeItemDetail['warnings']> {
  const title = normalizeContent(item.title).toLowerCase();
  if (!title && !normalizeContent(item.body)) return [];
  const { rows } = await db.query<Pick<Item, 'id' | 'title' | 'content_hash'>>(
    "SELECT id,title,content_hash FROM knowledge_items WHERE business_id=$1 AND id<>$2 AND status<>'deleted' ORDER BY updated_at DESC,id DESC",
    [item.business_id, item.id],
  );
  const warnings: KnowledgeItemDetail['warnings'] = [];
  for (const row of rows) {
    if (item.content_hash && item.content_hash === row.content_hash) {
      warnings.push({ code: 'duplicate_content', itemId: row.id, title: row.title });
    } else if (title && title === normalizeContent(row.title).toLowerCase()) {
      warnings.push({ code: 'duplicate_title', itemId: row.id, title: row.title });
    }
  }
  return warnings;
}

async function fileDetails(item: Item): Promise<KnowledgeFileTag[]> {
  const files = await Promise.all(item.files.map(async (tag) => {
    const stored = await storage.read(tag.fileId, { businessId: item.business_id });
    if (!stored) return null;
    return {
      ...tag, fileName: stored.file.originalName, mimeType: stored.file.mimeType,
      sizeBytes: stored.file.sizeBytes,
      url: '/api/v1/businesses/' + item.business_id + '/knowledge/items/' + item.id + '/files/' + tag.fileId,
    };
  }));
  return files.filter((file) => file !== null);
}

export async function itemDetail(item: Item): Promise<KnowledgeItemDetail> {
  const [states, warnings, files] = await Promise.all([
    getIndexStates(item.business_id, [item.id]), duplicateWarnings(item), fileDetails(item),
  ]);
  const index = stateOf(item, states);
  return {
    ...itemView(item, index), body: item.body, files, moderation: item.moderation, index,
    mutable: item.status !== 'deleted', warnings,
    createdAt: item.created_at.toISOString(), submittedAt: item.submitted_at?.toISOString() ?? null,
    activatedAt: item.activated_at?.toISOString() ?? null, deletedAt: item.deleted_at?.toISOString() ?? null,
  };
}

interface Revision extends Pick<Item, 'revision' | 'title' | 'body' | 'kind' | 'folder_id' | 'created_at' | 'status'> {
  created_by_name: string | null;
  current_revision: number;
}

const revisionSelect = 'SELECT r.revision,r.title,r.body,r.kind,r.folder_id,r.created_at,u.display_name AS created_by_name,' +
  'i.status,i.revision AS current_revision FROM knowledge_revisions r ' +
  'JOIN knowledge_items i ON i.id=r.item_id AND i.business_id=r.business_id ' +
  'LEFT JOIN users u ON u.id=r.created_by WHERE r.business_id=$1 AND r.item_id=$2';

function revisionRow(row: Revision): KnowledgeRevisionRow {
  return {
    revision: row.revision, title: row.title, createdAt: row.created_at.toISOString(),
    createdByName: row.created_by_name, isCurrent: row.revision === row.current_revision,
  };
}

export async function findRevision(businessId: string, id: string, revision: number):
  Promise<(KnowledgeRevisionDetail & { status: Item['status']; currentRevision: number }) | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const row = await db.maybeOne<Revision>(revisionSelect + ' AND r.revision=$3', [businessId, id, revision]);
  return row ? {
    ...revisionRow(row), body: row.body, kind: row.kind, folderId: row.folder_id,
    status: row.status, currentRevision: row.current_revision,
  } : null;
}

export async function listRevisions(businessId: string, id: string, query: RevisionQuery): Promise<Page<KnowledgeRevisionRow>> {
  await requireItem(businessId, id);
  const cursor = query.cursor == null ? null : Number(query.cursor);
  if (cursor !== null && (!/^[1-9]\d*$/.test(query.cursor!) || cursor > 2_147_483_647)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid revision cursor');
  }
  const { rows } = await db.query<Revision>(
    revisionSelect + ' AND ($3::int IS NULL OR r.revision<$3) ORDER BY r.revision DESC LIMIT $4',
    [businessId, id, cursor, query.limit + 1],
  );
  const items = rows.slice(0, query.limit).map(revisionRow);
  return { items, nextCursor: rows.length > query.limit ? String(items.at(-1)!.revision) : null };
}

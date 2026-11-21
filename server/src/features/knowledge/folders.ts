import { AppError, audit, db } from '../../core';
import type { KnowledgeFolderRow } from '@nless/shared/features/knowledge/types';
import { setItemFolder } from './index-port';
import type { Actor } from './lifecycle';

interface FolderRecord {
  id: string;
  name: string;
  created_at: Date;
  item_count?: number;
}

function folderError(code: 'folder_name_invalid' | 'folder_name_taken') {
  return new AppError('VALIDATION_ERROR', 'Invalid knowledge folder name', { details: { code } });
}

function folderName(input: string): string {
  const normalized = input.normalize('NFKC');
  const name = normalized.trim();
  if (!name || [...name].length > 100 || /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(normalized)) {
    throw folderError('folder_name_invalid');
  }
  return name;
}

function view(row: FolderRecord): KnowledgeFolderRow {
  return { id: row.id, name: row.name, itemCount: row.item_count ?? 0, createdAt: row.created_at.toISOString() };
}

const selectFolder = 'SELECT f.id,f.name,f.created_at,count(i.id)::int AS item_count FROM knowledge_folders f ' +
  "LEFT JOIN knowledge_items i ON i.business_id=f.business_id AND i.folder_id=f.id AND i.status<>'deleted'";

async function insertFolder(businessId: string, name: string, actorUserId: string | null): Promise<FolderRecord | null> {
  return db.maybeOne<FolderRecord>(
    'INSERT INTO knowledge_folders (business_id,name,created_by) VALUES ($1,$2,$3) ' +
    'ON CONFLICT (business_id,(lower(name))) DO NOTHING RETURNING id,name,created_at',
    [businessId, name, actorUserId],
  );
}

function auditFolder(businessId: string, actor: Actor, folderId: string, action: 'create' | 'rename' | 'delete') {
  return audit({ businessId, actorUserId: actor.userId, action: 'knowledge.folder.' + action,
    targetType: 'knowledge_folder', targetId: folderId });
}

export async function ensureKnowledgeFolder(
  businessId: string, input: string, actorUserId: string | null,
): Promise<{ id: string; name: string; created: boolean }> {
  const name = folderName(input);
  const first = await insertFolder(businessId, name, actorUserId);
  if (first) {
    await auditFolder(businessId, { userId: actorUserId }, first.id, 'create');
    return { id: first.id, name: first.name, created: true };
  }
  const existing = await db.maybeOne<Pick<FolderRecord, 'id' | 'name'>>(
    'SELECT id,name FROM knowledge_folders WHERE business_id=$1 AND lower(name)=lower($2)', [businessId, name],
  );
  if (existing) return { ...existing, created: false };
  const recreated = await insertFolder(businessId, name, actorUserId);
  if (!recreated) throw new AppError('SERVICE_NOT_READY', 'Knowledge folder changed during creation', { retryable: true });
  await auditFolder(businessId, { userId: actorUserId }, recreated.id, 'create');
  return { id: recreated.id, name: recreated.name, created: true };
}

export async function listFolders(businessId: string): Promise<{ items: KnowledgeFolderRow[]; unfiledCount: number }> {
  const [folders, unfiled] = await Promise.all([
    db.query<FolderRecord>(selectFolder + ' WHERE f.business_id=$1 GROUP BY f.id ORDER BY lower(f.name),f.id', [businessId]),
    db.one<{ count: number }>("SELECT count(*)::int AS count FROM knowledge_items WHERE business_id=$1 AND folder_id IS NULL AND status<>'deleted'",
      [businessId]),
  ]);
  return { items: folders.rows.map(view), unfiledCount: unfiled.count };
}

export async function createFolder(businessId: string, actor: Actor, input: string): Promise<KnowledgeFolderRow> {
  const created = await insertFolder(businessId, folderName(input), actor.userId);
  if (!created) throw folderError('folder_name_taken');
  await auditFolder(businessId, actor, created.id, 'create');
  return view(created);
}

export async function renameFolder(businessId: string, actor: Actor, folderId: string, input: string): Promise<KnowledgeFolderRow> {
  const name = folderName(input);
  try {
    const folder = await db.tx(async (tx) => {
      const changed = await tx.maybeOne<FolderRecord>(
        'UPDATE knowledge_folders SET name=$3,updated_at=now() WHERE business_id=$1 AND id=$2 RETURNING id,name,created_at',
        [businessId, folderId, name],
      );
      if (!changed) throw new AppError('NOT_FOUND', 'Knowledge folder not found');
      return tx.one<FolderRecord>(selectFolder + ' WHERE f.business_id=$1 AND f.id=$2 GROUP BY f.id', [businessId, folderId]);
    });
    await auditFolder(businessId, actor, folderId, 'rename');
    return view(folder);
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === '23505' &&
        'constraint' in cause && cause.constraint === 'knowledge_folders_name_uq') throw folderError('folder_name_taken');
    throw cause;
  }
}

export async function deleteFolder(businessId: string, actor: Actor, folderId: string): Promise<void> {
  const ids = await db.tx(async (tx) => {
    const folder = await tx.maybeOne('SELECT id FROM knowledge_folders WHERE business_id=$1 AND id=$2 FOR UPDATE',
      [businessId, folderId]);
    if (!folder) throw new AppError('NOT_FOUND', 'Knowledge folder not found');
    const { rows } = await tx.query<{ id: string }>('SELECT id FROM knowledge_items WHERE business_id=$1 AND folder_id=$2',
      [businessId, folderId]);
    await tx.query('DELETE FROM knowledge_folders WHERE business_id=$1 AND id=$2', [businessId, folderId]);
    return rows.map((row) => row.id);
  });
  for (let offset = 0; offset < ids.length; offset += 10) {
    await Promise.all(ids.slice(offset, offset + 10).map((itemId) =>
      setItemFolder({ businessId, itemId, folderId: null })));
  }
  await auditFolder(businessId, actor, folderId, 'delete');
}

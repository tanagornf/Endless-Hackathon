import { AppError, audit, auditInTransaction, db, log, publish } from '../../core';
import type { DbExecutor } from '../../core';
import type { AuthScope } from '@nless/shared/core/types';
import type { KnowledgeItemDetail } from '@nless/shared/features/knowledge/types';
import { contentHash, normalizeContent } from './hash';
import { getIndexStates, indexKnowledgeRevision, setItemFolder, setSearchable } from './index-port';
import { assertFolder, itemDetail, requireItem, snapshot } from './repo';
import type { Item } from './repo';
import type { ActivateBody, CreateBody, PatchBody } from './schema';
import { confirmOwnerConsultReuse } from './owner-consult-drafts';

export type Actor = { userId: string | null; scope?: AuthScope | null };
type Status = Item['status'];
const mutableStatuses: Status[] = ['draft', 'reviewed', 'active', 'inactive'];
const editableApprovalStatuses: Status[] = ['draft', 'reviewed', 'inactive'];

function usesExplicitApproval(item: Item): boolean {
  return item.source === 'web' || item.source === 'owner-consult';
}

function policy(reason: string): AppError {
  return new AppError('POLICY_BLOCKED', 'Knowledge transition is unavailable', { details: { reason } });
}

function assertTransition(item: Item, expected: number, allowed: Status[], reason: string): void {
  if (item.status === 'deleted') throw policy('deleted');
  if (!allowed.includes(item.status)) throw policy(reason);
  if (item.revision !== expected) {
    throw new AppError('VERSION_CONFLICT', 'Knowledge revision changed', { details: { currentRevision: item.revision } });
  }
}

function auditItem(action: string, actor: Actor, item: Item, details?: Record<string, unknown>): Promise<void> {
  return audit({ action: 'knowledge.item.' + action, actorUserId: actor.userId, businessId: item.business_id,
    targetType: 'knowledge_item', targetId: item.id, details });
}

const itemMutations = new Map<string, Promise<void>>();

async function withItemLock<T>(businessId: string, id: string, action: (item: Item) => Promise<T>): Promise<T> {
  const key = businessId + ':' + id.toLowerCase();
  const previous = itemMutations.get(key);
  let release!: () => void;
  const done = new Promise<void>((resolve) => { release = resolve; });
  itemMutations.set(key, done);
  try {
    await previous;
    return await action(await requireItem(businessId, id));
  } finally {
    release();
    if (itemMutations.get(key) === done) itemMutations.delete(key);
  }
}

async function queueIndex(item: Item, strict = false): Promise<void> {
  try {
    await indexKnowledgeRevision({ businessId: item.business_id, itemId: item.id, revision: item.revision });
    publish(item.business_id, { type: 'knowledge.status', knowledgeItemId: item.id, indexState: 'indexing' });
  } catch (cause) {
    log.warn({ knowledgeItemId: item.id, revision: item.revision }, 'Knowledge index enqueue failed');
    if (strict) throw cause;
  }
}

export async function createKnowledgeItem(businessId: string, actor: Actor, body: CreateBody,
  opts?: { source?: 'manual' | 'fixture' }): Promise<KnowledgeItemDetail> {
  const created = await db.tx(async (tx) => {
    await assertFolder(businessId, body.folderId, tx);
    const item = await tx.one<Item>(
      'INSERT INTO knowledge_items (business_id,folder_id,kind,title,body,content_hash,source,created_by,updated_by) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING id',
      [businessId, body.folderId, body.kind, body.title, body.body, contentHash(body.title, body.body),
        opts?.source ?? 'manual', actor.userId],
    );
    const saved = await requireItem(businessId, item.id, tx);
    await snapshot(tx, saved, actor.userId);
    return saved;
  });
  await auditItem('create', actor, created);
  return itemDetail(created);
}

export function patchKnowledgeItem(businessId: string, actor: Actor, id: string, body: PatchBody): Promise<KnowledgeItemDetail> {
  return withItemLock(businessId, id, async (item) => {
    assertTransition(item, body.expectedRevision, mutableStatuses, 'not_mutable');
    const title = body.title ?? item.title;
    const text = body.body ?? item.body;
    const kind = body.kind ?? item.kind;
    const folderId = body.folderId === undefined ? item.folder_id : body.folderId;
    const changed = new Set<string>();
    if (normalizeContent(title) !== normalizeContent(item.title)) changed.add('title');
    if (normalizeContent(text) !== normalizeContent(item.body)) changed.add('body');
    if (kind !== item.kind) changed.add('kind');
    const contentChanged = changed.size > 0;
    const allowed = contentChanged && usesExplicitApproval(item) ? editableApprovalStatuses : mutableStatuses;
    if (allowed === editableApprovalStatuses) assertTransition(item, body.expectedRevision, allowed,
      item.source === 'web' ? 'deactivate_web_before_editing' : 'owner_consult_deactivate_before_editing');
    if (folderId !== item.folder_id) changed.add('folderId');
    const storedFiles = new Map(item.files.map((file) => [file.fileId, file]));
    const files = body.files?.map((tag) => {
      const previous = storedFiles.get(tag.fileId);
      if (!previous) throw new AppError('NOT_FOUND', 'Knowledge attachment not found');
      storedFiles.delete(tag.fileId);
      return { ...previous, ...tag };
    }) ?? item.files;
    if (body.files && (storedFiles.size || JSON.stringify(files) !== JSON.stringify(item.files))) changed.add('files');
    if (!changed.size) return itemDetail(item);

    const saved = await db.tx(async (tx) => {
      if (changed.has('folderId')) await assertFolder(businessId, folderId, tx);
      const nextTitle = changed.has('title') ? title : item.title;
      const nextBody = changed.has('body') ? text : item.body;
      const result = await tx.maybeOne<Item>(
        'UPDATE knowledge_items SET title=$1,body=$2,kind=$3,folder_id=$4,files=$5,content_hash=$6,' +
        'revision=revision+$7::int,moderation=CASE WHEN $7=1 THEN NULL ELSE moderation END,updated_by=$8,updated_at=now() ' +
        'WHERE business_id=$9 AND id=$10 AND revision=$11 AND status=ANY($12::text[]) RETURNING id',
        [nextTitle, nextBody, kind, folderId, JSON.stringify(files), contentHash(nextTitle, nextBody),
          Number(contentChanged), actor.userId, businessId, id, body.expectedRevision, allowed],
      );
      if (!result) {
        assertTransition(await requireItem(businessId, id, tx), body.expectedRevision, allowed, 'not_mutable');
        throw new AppError('VERSION_CONFLICT', 'Knowledge revision changed');
      }
      const updated = await requireItem(businessId, id, tx);
      if (contentChanged) await snapshot(tx, updated, actor.userId);
      return updated;
    });
    if (changed.has('folderId')) await setItemFolder({ businessId, itemId: id, folderId });
    if (contentChanged && saved.status !== 'draft' && saved.source !== 'owner-consult') await queueIndex(saved);
    await auditItem('update', actor, saved, { fields: [...changed] });
    return itemDetail(saved);
  });
}

const transitionDates: Partial<Record<Status, string>> = {
  reviewed: 'submitted_at=now()', active: 'activated_at=now()', inactive: 'deactivated_at=now()',
  deleted: 'deleted_at=now(),deleted_by=$2',
};

async function changeStatus(item: Item, actor: Actor, status: Status, approvedReceipt?: string): Promise<Item> {
  const date = transitionDates[status];
  async function save(executor: DbExecutor) {
    const saved = await executor.maybeOne<{ id: string }>(
      'UPDATE knowledge_items SET status=$1,updated_by=$2,updated_at=now(),' + date +
      ' WHERE business_id=$3 AND id=$4 AND revision=$5 AND status=$6 RETURNING id',
      [status, actor.userId, item.business_id, item.id, item.revision, item.status],
    );
    if (!saved) throw new AppError('VERSION_CONFLICT', 'Knowledge revision changed');
    if (approvedReceipt) await auditInTransaction(executor, [{ action: 'knowledge.item.approve_owner_consult',
      actorUserId: actor.userId, businessId: item.business_id, targetType: 'knowledge_item', targetId: item.id,
      details: { revision: item.revision, answerReceiptId: approvedReceipt } }]);
    return requireItem(item.business_id, item.id, executor);
  }
  return approvedReceipt ? db.tx(save) : save(db);
}

async function restoreStatus(previous: Item, changed: Item): Promise<void> {
  await db.query(
    'UPDATE knowledge_items SET status=$1,updated_at=$2,updated_by=$3,activated_at=$4,deactivated_at=$5,deleted_at=$6,deleted_by=$7 ' +
    'WHERE business_id=$8 AND id=$9 AND revision=$10 AND status=$11',
    [previous.status, previous.updated_at, previous.updated_by, previous.activated_at, previous.deactivated_at,
      previous.deleted_at, previous.deleted_by, previous.business_id, previous.id, changed.revision, changed.status],
  );
}

async function updateSearchability(previous: Item, changed: Item, revision: number | null): Promise<boolean> {
  const input = { businessId: changed.business_id, itemId: changed.id, revision };
  try {
    if (revision === null) await setSearchable(input).catch(() => setSearchable(input));
    else await setSearchable(input);
    return true;
  } catch (cause) {
    if (usesExplicitApproval(changed) && revision !== null && cause instanceof AppError && cause.code === 'KNOWLEDGE_NOT_READY') {
      await queueIndex(changed);
      return false;
    }
    await restoreStatus(previous, changed);
    log.error({ knowledgeItemId: changed.id, revision: changed.revision }, 'Knowledge searchability update failed');
    throw new AppError('INTERNAL', 'Could not update knowledge searchability', { cause });
  }
}

function assertContent(item: Item): void {
  if (!normalizeContent(item.title) || !normalizeContent(item.body)) {
    throw new AppError('VALIDATION_ERROR', 'Knowledge title and body are required');
  }
}

export function submitKnowledgeItem(businessId: string, actor: Actor, id: string, expected: number): Promise<KnowledgeItemDetail> {
  return withItemLock(businessId, id, async (item) => {
    assertTransition(item, expected, ['draft'], 'not_draft');
    if (item.source === 'owner-consult') throw policy('owner_consult_approval_required');
    assertContent(item);
    const saved = await changeStatus(item, actor, 'reviewed');
    await queueIndex(saved);
    await auditItem('submit', actor, saved);
    return itemDetail(saved);
  });
}

export function activateKnowledgeItem(businessId: string, actor: Actor, id: string, body: ActivateBody): Promise<KnowledgeItemDetail> {
  return withItemLock(businessId, id, async (item) => {
    const ownerConsult = item.source === 'owner-consult';
    if (ownerConsult && (actor.scope?.role !== 'owner' || actor.scope.businessId?.toLowerCase() !== businessId ||
        actor.scope.userId !== actor.userId || !actor.userId)) throw new AppError('PERMISSION_DENIED', 'Shop owner approval required');
    const explicitApproval = usesExplicitApproval(item);
    const allowed: Status[] = ownerConsult ? [...editableApprovalStatuses, 'active']
      : explicitApproval ? editableApprovalStatuses : ['reviewed', 'inactive'];
    assertTransition(item, body.expectedRevision, allowed,
      item.status === 'draft' ? 'submit_first' : 'not_reviewed');
    if (explicitApproval) assertContent(item);
    else {
      const index = (await getIndexStates(businessId, [id]))[id];
      if (index?.state !== 'ready' || index.revision !== item.revision) {
        const state = index?.revision === item.revision ? index.state : 'not_started';
        throw new AppError('KNOWLEDGE_NOT_READY', 'Knowledge index is not ready', { details: { state } });
      }
    }
    if (item.moderation?.status === 'flagged' && !body.acknowledgeModeration) throw policy('moderation_flagged');
    const receiptId = ownerConsult ? await confirmOwnerConsultReuse(businessId, item.source_ref) : undefined;
    if (ownerConsult && item.status === 'active') return itemDetail(item);
    const saved = await changeStatus(item, actor, 'active', receiptId);
    const ready = await updateSearchability(item, saved, item.revision);
    if (!ownerConsult) await auditItem('activate', actor, saved);
    if (ready) publish(businessId, { type: 'knowledge.status', knowledgeItemId: id, indexState: 'ready' });
    return itemDetail(saved);
  });
}

export function deactivateKnowledgeItem(businessId: string, actor: Actor, id: string, expected: number): Promise<KnowledgeItemDetail> {
  return withItemLock(businessId, id, async (item) => {
    assertTransition(item, expected, ['active'], item.status === 'draft' ? 'submit_first' : 'not_active');
    const saved = await changeStatus(item, actor, 'inactive');
    await updateSearchability(item, saved, null);
    await auditItem('deactivate', actor, saved);
    return itemDetail(saved);
  });
}

type DeletedItem = { id: string; status: 'deleted'; deletedAt: string };

async function deleteItem(item: Item, actor: Actor, action: 'delete' | 'reject'): Promise<DeletedItem> {
  if (item.status === 'deleted') return { id: item.id, status: 'deleted', deletedAt: item.deleted_at!.toISOString() };
  const saved = await changeStatus(item, actor, 'deleted');
  await updateSearchability(item, saved, null);
  await auditItem(action, actor, saved);
  if (action === 'reject') publish(item.business_id, { type: 'knowledge.status', knowledgeItemId: item.id, indexState: 'not_started' });
  return { id: item.id, status: 'deleted', deletedAt: saved.deleted_at!.toISOString() };
}

export function deleteKnowledgeItem(businessId: string, actor: Actor, id: string): Promise<DeletedItem> {
  return withItemLock(businessId, id, (item) => deleteItem(item, actor, 'delete'));
}

export function rejectWebKnowledgeDraft(businessId: string, actor: Actor, id: string, expected: number): Promise<DeletedItem> {
  return withItemLock(businessId, id, async (item) => {
    if (item.source !== 'web') throw policy('not_web_suggestion');
    if (item.status !== 'deleted') assertTransition(item, expected, ['draft', 'reviewed'], 'not_pending');
    return deleteItem(item, actor, 'reject');
  });
}

export function reindexKnowledgeItem(businessId: string, _actor: Actor, id: string): Promise<KnowledgeItemDetail> {
  return withItemLock(businessId, id, async (item) => {
    if (item.source === 'owner-consult' && item.status !== 'active') throw policy('owner_consult_approval_required');
    assertTransition(item, item.revision, ['reviewed', 'active', 'inactive'], 'submit_first');
    await queueIndex(item, true);
    return itemDetail(item);
  });
}

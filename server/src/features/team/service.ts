import { AppError, audit, db, log, publish } from '../../core';
import type { DbExecutor } from '../../core';
import type { AssignmentResult, ConversationTeamState } from '@nless/shared/features/team/types';
import { notify } from '../notifications/service';
import { uuid } from './validation';

interface Member {
  userId: string;
  displayName: string;
}

interface ConversationRow extends AssignmentResult {
  businessId: string;
  customerId: string;
  status: ConversationTeamState['status'];
}

async function loadConversation(tx: DbExecutor, conversationId: string, businessId?: string, lock = false) {
  if (!uuid.safeParse(conversationId).success || (businessId !== undefined && !uuid.safeParse(businessId).success)) {
    throw new AppError('NOT_FOUND', 'Conversation not found');
  }
  const row = await tx.maybeOne<ConversationRow>(
    'SELECT id AS "conversationId", business_id AS "businessId", customer_id AS "customerId", handler, ' +
    'assignee_user_id AS "assigneeUserId", status, version FROM conversations ' +
    'WHERE id = $1 AND ($2::uuid IS NULL OR business_id = $2)' + (lock ? ' FOR UPDATE' : ''),
    [conversationId, businessId ?? null],
  );
  if (!row) throw new AppError('NOT_FOUND', 'Conversation not found');
  return row;
}

async function activeMember(tx: DbExecutor, businessId: string, userId: string | null): Promise<Member | null> {
  if (!uuid.safeParse(userId).success) return null;
  return tx.maybeOne<Member>(
    'SELECT u.id AS "userId", u.display_name AS "displayName" FROM users u JOIN memberships m ON m.user_id = u.id ' +
    "WHERE m.business_id = $1 AND m.user_id = $2 AND m.status = 'active' AND u.status = 'active'",
    [businessId, userId],
  );
}

function assignment({ conversationId, handler, assigneeUserId, version }: ConversationRow): AssignmentResult {
  return { conversationId, handler, assigneeUserId, version };
}

export async function isHumanTakeover(conversationId: string): Promise<boolean> {
  if (!uuid.safeParse(conversationId).success) return false;
  const row = await db.maybeOne<{ handler: string }>('SELECT handler FROM conversations WHERE id = $1', [conversationId]);
  return row?.handler === 'human';
}

export async function getConversationTeamState(
  conversationId: string, businessId: string, mayTakeover: boolean,
): Promise<ConversationTeamState> {
  const row = await loadConversation(db, conversationId, businessId);
  const holder = await activeMember(db, businessId, row.assigneeUserId);
  return {
    ...assignment(row),
    assigneeUserId: holder?.userId ?? null,
    assigneeName: holder?.displayName ?? null,
    status: row.status,
    isQueued: row.status === 'open' && row.handler === 'human' && !holder,
    canTakeover: mayTakeover && row.status === 'open',
    candidates: [],
  };
}

interface AssignmentOptions {
  expectedVersion?: number;
  actorUserId?: string;
  businessId?: string;
}

type Change =
  | { kind: 'assign'; userId: string | null }
  | { kind: 'takeover'; userId: string; force: boolean }
  | { kind: 'release'; note?: string }
  | { kind: 'handoff'; reason: string; actor: 'ai' | 'customer' | 'staff' };

function handoverNote(change: Change, name: string, holder: Member | null, assignee: Member | null): string {
  if (change.kind === 'handoff') {
    const source = { ai: 'AI', customer: 'ลูกค้า', staff: 'พนักงาน' }[change.actor];
    return source + ' ขอให้พนักงานดูแล (เหตุผล: ' + change.reason.slice(0, 80) + ')';
  }
  if (!assignee) {
    const note = change.kind === 'release' && change.note ? '\n' + change.note : '';
    return name + ' คืนแชตให้ AI' + note;
  }
  if (change.kind === 'assign') return name + ' มอบหมายแชตให้ ' + assignee.displayName;
  return holder?.displayName ? name + ' รับช่วงต่อจาก ' + holder.displayName : name + ' รับช่วงแชต';
}

async function changeAssignment(conversationId: string, change: Change, opts: AssignmentOptions = {}): Promise<AssignmentResult> {
  const { actorUserId, expectedVersion } = opts;
  const userId = 'userId' in change ? change.userId : null;
  const handler: AssignmentResult['handler'] = change.kind === 'handoff' || userId !== null ? 'human' : 'ai';
  const result = await db.tx(async (tx) => {
    // Check the version and active holder while holding the same lock as the write.
    const row = await loadConversation(tx, conversationId, opts.businessId, true);
    if (handler === 'human' && row.status === 'closed') {
      throw new AppError('POLICY_BLOCKED', 'Conversation is closed', { details: { reason: 'conversation_closed' } });
    }
    if (change.kind === 'handoff' && row.handler === 'human') return { row };
    const holder = await activeMember(tx, row.businessId, row.assigneeUserId);
    const otherHolder = change.kind === 'takeover' && holder && holder.userId !== change.userId.toLowerCase();
    const stale = expectedVersion !== undefined && expectedVersion !== row.version;
    if (stale || (change.kind === 'takeover' && otherHolder && !change.force && expectedVersion !== row.version)) {
      throw new AppError('VERSION_CONFLICT', 'Conversation changed', { details: {
        currentVersion: row.version,
        ...(holder ? { holder } : {}),
        ...(otherHolder ? { reason: 'conversation_taken' } : {}),
      } });
    }
    const assignee = await activeMember(tx, row.businessId, userId);
    if (userId !== null && !assignee) throw new AppError('VALIDATION_ERROR', 'Assignee must be an active member');
    const assigneeUserId = assignee?.userId ?? null;
    if (row.handler === handler && row.assigneeUserId === assigneeUserId) return { row };

    const actor = actorUserId === assignee?.userId ? assignee : await activeMember(tx, row.businessId, actorUserId ?? null);
    const { version } = await tx.one<{ version: number }>(
      'UPDATE conversations SET handler = $3, assignee_user_id = $4, version = version + 1, updated_at = now() ' +
      'WHERE id = $1 AND business_id = $2 RETURNING version',
      [row.conversationId, row.businessId, handler, assigneeUserId],
    );
    await tx.query(
      "INSERT INTO conversation_notes (business_id, customer_id, conversation_id, kind, body, author_user_id) " +
      "VALUES ($1, $2, $3, 'handover', $4, $5)",
      [row.businessId, row.customerId, row.conversationId,
        handoverNote(change, actor?.displayName || 'ระบบ', holder, assignee).slice(0, 2000), actor?.userId ?? null],
    );
    return { row: { ...row, handler, assigneeUserId, version }, from: row.assigneeUserId, actorId: actor?.userId ?? null };
  });

  const { row } = result;
  const value = assignment(row);
  if (!('from' in result)) return value;
  publish(row.businessId, { type: 'conversation.updated', ...value, status: row.status });
  await audit({
    action: change.kind === 'handoff' ? 'conversation.handoff.requested' : 'conversation.assign',
    actorUserId: result.actorId ?? null,
    businessId: row.businessId,
    targetType: 'conversation',
    targetId: row.conversationId,
    details: change.kind === 'handoff' ? { reason: change.reason.slice(0, 80), actor: change.actor }
      : { from: result.from, to: row.assigneeUserId, handler: row.handler },
  });
  if (change.kind === 'handoff') await notifyHandoff(row);
  return value;
}

async function notifyHandoff(row: ConversationRow): Promise<void> {
  try {
    const customer = await db.maybeOne<{ displayName: string }>(
      'SELECT display_name AS "displayName" FROM customers WHERE id = $1 AND business_id = $2',
      [row.customerId, row.businessId],
    );
    await notify({
      businessId: row.businessId,
      to: { permission: 'chat.takeover' },
      type: 'chat.handoff',
      title: 'ลูกค้าต้องการคุยกับพนักงาน',
      body: customer?.displayName || undefined,
      link: '/chat?c=' + row.conversationId,
      dedupKey: 'handoff:' + row.conversationId + ':v' + row.version,
    });
  } catch {
    log.warn({ conversationId: row.conversationId }, 'Handoff notification failed');
  }
}

export async function assignConversation(
  conversationId: string,
  userId: string | null,
  opts?: { expectedVersion?: number; actorUserId?: string; businessId?: string },
): Promise<AssignmentResult> {
  return changeAssignment(conversationId, { kind: 'assign', userId }, opts);
}

export async function takeoverConversation(
  conversationId: string, userId: string, opts: { businessId: string; expectedVersion?: number; force: boolean },
): Promise<AssignmentResult> {
  return changeAssignment(conversationId, { kind: 'takeover', userId, force: opts.force }, { ...opts, actorUserId: userId });
}

export async function releaseConversation(
  conversationId: string, opts: { businessId: string; actorUserId: string; note?: string },
): Promise<AssignmentResult> {
  return changeAssignment(conversationId, { kind: 'release', note: opts.note }, opts);
}

export async function requestHumanHandoff(
  conversationId: string,
  input: { reason: string; actor: 'ai' | 'customer' | 'staff' },
  opts?: { businessId?: string },
): Promise<AssignmentResult> {
  return changeAssignment(conversationId, { kind: 'handoff', reason: input.reason, actor: input.actor }, opts);
}

/**
 * @owner F11 team · A1 · consumers: A1 F09 (Demo Chat reset), F11 idle timers
 * Closes the conversation (status 'closed', closed_at, version + 1, publish 'conversation.updated', audit
 * 'conversation.close'). Never a 409; closing twice is a no-op.
 */
export async function closeConversation(
  conversationId: string,
  opts: { actorUserId: string | null; reason?: string; businessId?: string },
): Promise<{ status: 'closed'; version: number }> {
  throw new AppError("SERVICE_NOT_READY", "closeConversation is not implemented");
}

/**
 * @owner F11 team · A1. Reopens the customer's most recently closed conversation when the customer has no open one,
 * otherwise POLICY_BLOCKED (details.reason 'customer_has_open_conversation').
 */
export async function reopenConversation(
  conversationId: string,
  opts: { actorUserId: string; businessId?: string },
): Promise<{ status: 'open'; version: number }> {
  throw new AppError("SERVICE_NOT_READY", "reopenConversation is not implemented");
}

/**
 * @owner F11 team · A1 · consumer: B3 F27 (staff available now)
 * The availability in effect at `at` (default now) of every member of the business who holds chat.takeover.
 * @fake []
 */
export async function getTeamAvailability(
  businessId: string,
  at?: string,
): Promise<{ userId: string; displayName: string; availability: 'available' | 'away' | 'off_shift' }[]> {
  throw new AppError("SERVICE_NOT_READY", "getTeamAvailability is not implemented");
}

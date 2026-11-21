import { AppError } from '../../core';
import { db } from '../../core';
import { changeAssignee } from './setup';
import type { AssignmentResult } from '@nless/shared/features/team/types';

/**
 * @owner F11 team · A1 · consumers: B2 ai.reply handler (must stay silent when true), C2 (channels, comments)
 * True when a human holds the conversation (conversations.handler = 'human'). Unknown id → false.
 * @fake real: SELECT handler = 'human' FROM conversations.
 */
export async function isHumanTakeover(conversationId: string): Promise<boolean> {
  const row = await db.maybeOne<{ handler: string }>('SELECT handler FROM conversations WHERE id=$1', [conversationId]);
  return row?.handler === 'human';
}

/**
 * @owner F11 team · A1. userId → takeover by that member (handler 'human'); null → hand back to AI (handler 'ai').
 * opts.expectedVersion mismatch → VERSION_CONFLICT (409). Assignee not a member of the business → VALIDATION_ERROR.
 * Bumps version, publishes 'conversation.updated', writes audit 'conversation.assign'.
 * @fake real minimal UPDATE on core conversations (+ version check, publish). F11 adds schedules, notes, idle rules.
 */
export async function assignConversation(
  conversationId: string,
  userId: string | null,
  opts?: { expectedVersion?: number; actorUserId?: string; businessId?: string },
): Promise<AssignmentResult> {
  return changeAssignee(conversationId, userId === null ? 'ai' : 'human', userId, opts);
}

/**
 * @owner F11 team · A1 · consumers: B2 F10 (escalation, PROVIDER_BUDGET_EXHAUSTED), B2 F30 voice (customer asks for a person)
 * Puts the conversation into human handling WITHOUT an assignee: handler 'human', assignee null → isHumanTakeover()
 * is true, the bot goes silent, the conversation shows in the "waiting for staff" queue; writes an audit note, publishes
 * 'conversation.updated', audits 'conversation.handoff.requested', calls
 * notify({ type: 'chat.handoff', to: { permission: 'chat.takeover' }, link: '/chat?c=<id>' }) and, when the team's
 * auto-assign setting is on, assigns an available staff member round-robin. Idempotent: already 'human' → returns the
 * current state, no version bump, no second notification. Closed conversation → POLICY_BLOCKED. Unknown id or another
 * business → NOT_FOUND. `reason` is free text for the note (F10 sends customer_request | cannot_answer | complaint |
 * payment_issue | budget_exhausted | ai_failed | other). F10 does NOT call notify() itself when this call succeeds.
 * @fake flips an in-memory flag so isHumanTakeover(conversationId) returns true; returns
 *   { conversationId, assigneeUserId: null, handler: 'human', version: 1 }.
 */
export async function requestHumanHandoff(
  conversationId: string,
  input: { reason: string; actor: 'ai' | 'customer' | 'staff' },
  opts?: { businessId?: string },
): Promise<AssignmentResult> {
  return changeAssignee(conversationId, 'human', null, opts);
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

import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, expect, test, vi } from 'vitest';
import type { AiHandoffIntent } from '@nless/shared/features/team/types';
import * as core from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import * as settings from '../business-settings/service';
import { saveMessage } from '../inbox/service';
import * as notifications from '../notifications/service';
import { retryDueAiHandoffNotifications } from './aiHandoff';
import { applyAiHandoff, assignConversation, getAiHandoffReceipt, getExplicitStaffRequestForNotification, requestHumanHandoff } from './service';

const businessId = seedId('biz_demo_a');
const otherBusiness = seedId('biz_demo_b');
const staff = seedId('staff_a');

vi.setConfig({ testTimeout: 30000 });
afterEach(() => vi.restoreAllMocks());
afterAll(closeDb);

async function newIntent(): Promise<AiHandoffIntent> {
  const { conversation } = await saveMessage({
    businessId,
    customer: { channel: 'web', externalId: 'receipt-' + randomUUID(), displayName: 'Fixture visitor' },
    direction: 'inbound', author: 'customer', parts: [{ type: 'text', text: 'Synthetic handoff' }],
    externalId: randomUUID(), triggerAi: false,
  });
  return { businessId, conversationId: conversation.id, turnId: randomUUID(),
    expectedVersion: conversation.version, reason: 'customer_request' };
}

async function counts(intent: AiHandoffIntent) {
  return core.db.one(`SELECT
    (SELECT count(*)::int FROM conversation_notes WHERE business_id=$1 AND conversation_id=$2) AS notes,
    (SELECT count(*)::int FROM audit_events WHERE business_id=$1 AND target_id=$2::uuid::text AND action='conversation.handoff.requested') AS audits,
    (SELECT count(*)::int FROM team_ai_handoff_receipts WHERE business_id=$1 AND conversation_id=$2) AS receipts`,
  [intent.businessId, intent.conversationId]);
}

test('same intent serializes to one assignment, receipt, note, audit and Thai notification', async () => {
  const intent = await newIntent();
  const notified = vi.spyOn(notifications, 'notify');
  const published = vi.spyOn(core, 'publish');
  const expected = { ...intent, committedVersion: intent.expectedVersion + 1 };
  expect(await getAiHandoffReceipt(intent)).toBeNull();
  expect(await Promise.all([applyAiHandoff(intent), applyAiHandoff(intent)])).toEqual([expected, expected]);
  expect(await applyAiHandoff(intent)).toEqual(expected);
  expect(await getAiHandoffReceipt(intent)).toEqual(expected);
  expect(await counts(intent)).toEqual({ notes: 1, receipts: 1, audits: 1 });
  expect(published.mock.calls.filter(([, event]) => event.type === 'conversation.updated')).toEqual([
    [businessId, { type: 'conversation.updated', conversationId: intent.conversationId,
      handler: 'human', assigneeUserId: null, status: 'open', version: expected.committedVersion }],
  ]);
  expect(notified).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    title: 'ลูกค้าต้องการคุยกับพนักงาน', dedupKey: 'handoff:' + intent.conversationId + ':v' + expected.committedVersion,
  }));
  const delivery = await notified.mock.results[0].value;
  if (delivery.mode === 'real') {
    // Redelivering the same logical notice must create neither another row nor another event.
    const replay = await notifications.notify(notified.mock.calls[0][0]);
    expect(replay).toEqual({ mode: 'real', notificationIds: [] });
  }
  const recipients: string[] = [];
  const ids: string[] = [];
  for (const [shop, event, scope] of published.mock.calls) {
    if (event.type !== 'notification.created') continue;
    expect(shop).toBe(businessId);
    expect(scope).toEqual({ userIds: [event.userId] });
    recipients.push(event.userId);
    ids.push(event.notificationId);
  }
  expect(recipients.sort()).toEqual(delivery.mode === 'real' ? [seedId('owner_a'), staff].sort() : []);
  expect(ids.sort()).toEqual([...delivery.notificationIds].sort());
});

test('current proof requires the exact tuple and current unassigned human queue version', async () => {
  const initial = await newIntent();
  const competing = { ...initial, turnId: randomUUID() };
  const [first, second] = await Promise.all([applyAiHandoff(initial), applyAiHandoff(competing)]);
  expect([first, second].filter(Boolean)).toHaveLength(1);
  const intent = first ? initial : competing;
  const expected = first ?? second!;
  for (const invalid of [
    { ...intent, businessId: otherBusiness }, { ...intent, turnId: randomUUID() },
    { ...intent, conversationId: randomUUID() }, { ...intent, expectedVersion: expected.committedVersion },
    { ...intent, reason: 'ai_failed' },
  ]) {
    expect(await getAiHandoffReceipt(invalid)).toBeNull();
    expect(await applyAiHandoff(invalid)).toBeNull();
  }
  expect(await counts(intent)).toEqual({ notes: 1, receipts: 1, audits: 1 });

  await assignConversation(intent.conversationId, staff, { businessId });
  expect(await getAiHandoffReceipt(intent)).toBeNull();
  expect(await applyAiHandoff(intent)).toBeNull();
  const released = await assignConversation(intent.conversationId, null, { businessId });
  expect(await applyAiHandoff({ ...intent, expectedVersion: released.version })).toBeNull();
  const next = { ...intent, turnId: randomUUID(), expectedVersion: released.version };
  expect(await applyAiHandoff(next)).toEqual({ ...next, committedVersion: released.version + 1 });
  expect(await getAiHandoffReceipt(intent)).toBeNull();
  expect(await applyAiHandoff(intent)).toBeNull();
  await core.db.query("UPDATE conversations SET status='closed', closed_at=now() WHERE business_id=$1 AND id=$2",
    [businessId, intent.conversationId]);
  expect(await getAiHandoffReceipt(next)).toBeNull();
  expect(await applyAiHandoff(next)).toBeNull();
});

test('manual and legacy queues never provide proof for a new AI turn', async () => {
  const intent = await newIntent();
  await requestHumanHandoff(intent.conversationId, { actor: 'staff', reason: 'customer_request' }, { businessId });
  expect(await applyAiHandoff(intent)).toBeNull();
  expect(await getAiHandoffReceipt(intent)).toBeNull();
  expect(await counts(intent)).toEqual({ notes: 1, receipts: 0, audits: 1 });
});

test('ambiguous commit before postcommit signals is recoverable with one durable staff dispatch', async () => {
  const intent = await newIntent();
  const notified = vi.spyOn(notifications, 'notify');
  const transaction = core.db.tx.bind(core.db);
  vi.spyOn(core.db, 'tx').mockImplementationOnce(async (callback) => {
    await transaction(callback);
    throw new Error('Lost commit acknowledgement');
  });
  await expect(applyAiHandoff(intent)).rejects.toThrow('Lost commit acknowledgement');
  const expected = { ...intent, committedVersion: intent.expectedVersion + 1 };
  expect(await getAiHandoffReceipt(intent)).toEqual(expected);
  expect(await applyAiHandoff(intent)).toEqual(expected);
  expect(notified).not.toHaveBeenCalled();
  await retryDueAiHandoffNotifications();
  await retryDueAiHandoffNotifications();
  expect(notified).toHaveBeenCalledTimes(1);
  expect(await counts(intent)).toEqual({ notes: 1, receipts: 1, audits: 1 });
});

test('an uncertain English notification retries using the same external deduplication key', async () => {
  const intent = await newIntent();
  const getSettings = settings.getBusinessSettings;
  vi.spyOn(settings, 'getBusinessSettings').mockImplementation(async (id) => ({ ...await getSettings(id), language: 'en' }));
  const notified = vi.spyOn(notifications, 'notify').mockRejectedValueOnce(new Error('Lost delivery acknowledgement'));
  const expected = await applyAiHandoff(intent);
  expect(expected).not.toBeNull();
  const request = expect.objectContaining({ title: 'Customer asked to speak to a team member',
    dedupKey: 'handoff:' + intent.conversationId + ':v' + expected!.committedVersion });
  expect(notified).toHaveBeenNthCalledWith(1, request);
  await core.db.query(`UPDATE team_ai_handoff_receipts SET notification_due_at=now()
    WHERE business_id=$1 AND conversation_id=$2 AND turn_id=$3`, [businessId, intent.conversationId, intent.turnId]);
  await retryDueAiHandoffNotifications();
  expect(notified).toHaveBeenNthCalledWith(2, request);
  await retryDueAiHandoffNotifications();
  expect(notified).toHaveBeenCalledTimes(2);
});

test('a failed transition rolls back receipt, note, and assignment together', async () => {
  const intent = await newIntent();
  const transaction = core.db.tx.bind(core.db);
  vi.spyOn(core.db, 'tx').mockImplementationOnce((callback) => transaction(async (tx) => {
    await callback(tx);
    throw new Error('Transaction failed before commit');
  }));
  await expect(applyAiHandoff(intent)).rejects.toThrow('Transaction failed before commit');
  expect(await counts(intent)).toEqual({ notes: 0, receipts: 0, audits: 0 });
  expect(await getAiHandoffReceipt(intent)).toBeNull();
  expect(await applyAiHandoff(intent)).toEqual({ ...intent, committedVersion: intent.expectedVersion + 1 });
});

test('a delayed notification is retired after staff claims the conversation', async () => {
  const intent = await newIntent();
  const notified = vi.spyOn(notifications, 'notify').mockRejectedValueOnce(new Error('Notification transport interrupted'));
  await applyAiHandoff(intent);
  await assignConversation(intent.conversationId, staff, { businessId });
  await core.db.query(`UPDATE team_ai_handoff_receipts SET notification_due_at=now()
    WHERE business_id=$1 AND conversation_id=$2 AND turn_id=$3`, [businessId, intent.conversationId, intent.turnId]);
  await retryDueAiHandoffNotifications();
  expect(notified).toHaveBeenCalledTimes(1);
  expect(await core.db.one(`SELECT notification_result FROM team_ai_handoff_receipts
    WHERE business_id=$1 AND conversation_id=$2 AND turn_id=$3`, [businessId, intent.conversationId, intent.turnId]))
    .toEqual({ notification_result: 'obsolete' });
});

test('a mismatched shop cannot mutate a still eligible conversation', async () => {
  const intent = await newIntent();
  expect(await applyAiHandoff({ ...intent, businessId: otherBusiness })).toBeNull();
  expect(await getAiHandoffReceipt({ ...intent, businessId: otherBusiness })).toBeNull();
  expect(await counts(intent)).toEqual({ notes: 0, receipts: 0, audits: 0 });
  expect(await applyAiHandoff(intent)).toEqual({ ...intent, committedVersion: intent.expectedVersion + 1 });
});

function latch() {
  let open!: () => void;
  const wait = new Promise<void>((resolve) => { open = resolve; });
  return { wait, open };
}

test('staff claim during notification preparation suppresses the obsolete notification', async () => {
  const intent = await newIntent();
  const preparing = latch();
  const resume = latch();
  const readSettings = settings.getBusinessSettings;
  vi.spyOn(settings, 'getBusinessSettings').mockImplementationOnce(async (id) => {
    preparing.open();
    await resume.wait;
    return readSettings(id);
  });
  const notified = vi.spyOn(notifications, 'notify');
  const applying = applyAiHandoff(intent);
  try {
    await preparing.wait;
    await assignConversation(intent.conversationId, staff, { businessId });
  } finally { resume.open(); }
  await applying;
  expect(notified).not.toHaveBeenCalled();
  expect(await core.db.one(`SELECT notification_result FROM team_ai_handoff_receipts
    WHERE business_id=$1 AND conversation_id=$2 AND turn_id=$3`, [businessId, intent.conversationId, intent.turnId]))
    .toEqual({ notification_result: 'obsolete' });
});

test('an expired worker cannot complete a receipt held by the replacement worker', async () => {
  const intent = await newIntent();
  const firstDispatch = latch();
  const finishFirst = latch();
  const secondDispatch = latch();
  const finishSecond = latch();
  const notified = vi.spyOn(notifications, 'notify')
    .mockImplementationOnce(async () => { firstDispatch.open(); await finishFirst.wait; return { notificationIds: [], mode: 'real' }; })
    .mockImplementationOnce(async () => { secondDispatch.open(); await finishSecond.wait; return { notificationIds: [], mode: 'sandbox' }; });
  const applying = applyAiHandoff(intent);
  let sweeping: Promise<void> | undefined;
  const params = [businessId, intent.conversationId, intent.turnId];
  const result = () => core.db.one(`SELECT notification_result FROM team_ai_handoff_receipts
    WHERE business_id=$1 AND conversation_id=$2 AND turn_id=$3`, params);
  try {
    await firstDispatch.wait;
    await core.db.query(`UPDATE team_ai_handoff_receipts SET notification_due_at=now()
      WHERE business_id=$1 AND conversation_id=$2 AND turn_id=$3`, params);
    sweeping = retryDueAiHandoffNotifications();
    await secondDispatch.wait;
    finishFirst.open();
    await applying;
    expect(await result()).toEqual({ notification_result: null });
  } finally {
    finishFirst.open();
    finishSecond.open();
    await Promise.all([applying, sweeping]);
  }
  expect(await result()).toEqual({ notification_result: 'sandbox' });
  expect(notified).toHaveBeenCalledTimes(2);
  expect(notified.mock.calls[0][0].dedupKey).toBe(notified.mock.calls[1][0].dedupKey);
});

test.each(['customer_asked', 'accepted_staff_offer'] as const)(
  'returns current committed customer confirmation evidence for %s only in its owning shop',
  async (explicitRequestEvidence) => {
    const intent = { ...await newIntent(), explicitRequestEvidence };
    const notified = vi.spyOn(notifications, 'notify');
    const committedVersion = intent.expectedVersion + 1;
    const key = 'handoff:' + intent.conversationId + ':v' + committedVersion;
    const proof = { conversationId: intent.conversationId, committedVersion, explicitRequestEvidence };
    expect(await getExplicitStaffRequestForNotification(businessId, key)).toBeNull();
    expect(await applyAiHandoff(intent)).toEqual({ ...intent, committedVersion });
    expect(await applyAiHandoff(intent)).toEqual({ ...intent, committedVersion });
    expect(await getAiHandoffReceipt(intent)).toEqual({ ...intent, committedVersion });
    const trustedKey = 'staff-offer-accepted:' + businessId + ':' + intent.conversationId + ':v' + committedVersion;
    expect(notified).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      businessId, to: { permission: 'chat.takeover' }, type: 'chat.handoff', dedupKey: trustedKey,
    }));
    const delivery = await notified.mock.results[0].value;
    if (delivery.mode === 'real') {
      expect(delivery.notificationIds).toHaveLength(2);
      const input = notified.mock.calls[0][0];
      expect(await notifications.notify({ ...input, dedupKey: key })).toEqual({ notificationIds: [], mode: 'real' });
    }
    expect(await getExplicitStaffRequestForNotification(businessId, trustedKey)).toBeNull();
    expect(await getExplicitStaffRequestForNotification(businessId, key)).toEqual(proof);
    expect(await getExplicitStaffRequestForNotification(otherBusiness, key)).toBeNull();
    for (const invalid of [key + '0', key + '\n', key.replace(':v', ':v0'), 'handoff:' + intent.turnId]) {
      expect(await getExplicitStaffRequestForNotification(businessId, invalid)).toBeNull();
    }
    const otherEvidence = explicitRequestEvidence === 'customer_asked' ? 'accepted_staff_offer' : 'customer_asked';
    expect(await applyAiHandoff({ ...intent, explicitRequestEvidence: otherEvidence })).toBeNull();
    await assignConversation(intent.conversationId, staff, { businessId });
    expect(await getExplicitStaffRequestForNotification(businessId, key)).toBeNull();
    const released = await assignConversation(intent.conversationId, null, { businessId });
    await applyAiHandoff({ ...intent, turnId: randomUUID(), expectedVersion: released.version });
    expect(await getExplicitStaffRequestForNotification(businessId, key)).toBeNull();
  },
);

test('initial, model-only, legacy and fallback reasons cannot be promoted to an explicit confirmed handoff', async () => {
  const intent = await newIntent();
  expect(await applyAiHandoff({ ...intent, reason: 'ai_failed', explicitRequestEvidence: 'customer_asked' })).toBeNull();
  const receipt = await applyAiHandoff(intent);
  expect(receipt).toEqual({ ...intent, committedVersion: intent.expectedVersion + 1 });
  expect(await applyAiHandoff({ ...intent, explicitRequestEvidence: 'customer_asked' })).toBeNull();
  expect(await getAiHandoffReceipt({ ...intent, explicitRequestEvidence: 'accepted_staff_offer' })).toBeNull();
  expect(await getExplicitStaffRequestForNotification(businessId, 'handoff:' + intent.conversationId + ':v' + receipt!.committedVersion)).toBeNull();
  expect(await getExplicitStaffRequestForNotification(businessId, 'handoff:' + intent.turnId)).toBeNull();
  expect(await counts(intent)).toEqual({ notes: 1, receipts: 1, audits: 1 });
});

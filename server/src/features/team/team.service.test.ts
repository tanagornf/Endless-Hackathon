import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest';
import * as core from '../../core';
import { closeDb } from '../../core/db';
import { seedId } from '../../core/seed';
import { createTestAgent, drainJobs, loginAs } from '../../core/test-utils';
import { getHistory, saveMessage } from '../inbox/service';
import * as notifications from '../notifications/service';
import { assignConversation, isHumanTakeover, requestHumanHandoff } from './service';

const businessId = seedId('biz_demo_a');
const otherBusinessId = seedId('biz_demo_b');
const staff = seedId('staff_a');
const owner = seedId('owner_a');
const staffB = seedId('staff_b');
const csrf = 'X-Requested-With';

vi.setConfig({ testTimeout: 20000 });

afterAll(closeDb);
afterEach(() => vi.restoreAllMocks());

async function inbound(id: string, triggerAi = false, shop = businessId, text = 'A-GAME-01 ราคาเท่าไหร่') {
  return saveMessage({
    businessId: shop,
    customer: { channel: 'web', externalId: id, displayName: 'Synthetic Visitor' },
    direction: 'inbound',
    author: 'customer',
    parts: [{ type: 'text', text }],
    externalId: 'msg-' + randomUUID(),
    triggerAi,
  });
}

async function newChat(shop = businessId) {
  return (await inbound('team-' + randomUUID(), false, shop)).conversation;
}

async function closedChat() {
  const chat = await newChat();
  await core.db.query("UPDATE conversations SET status = 'closed', closed_at = now() WHERE id = $1 AND business_id = $2", [chat.id, businessId]);
  return chat.id;
}

function chatPath(id: string) {
  return '/api/v1/conversations/' + id;
}

describe('team service', () => {
  test('assigns once, rejects stale updates, and returns the chat to AI', async () => {
    const chat = await newChat();
    const publish = vi.spyOn(core, 'publish');
    expect(await isHumanTakeover(chat.id)).toBe(false);
    expect(await isHumanTakeover('invalid')).toBe(false);
    expect(await isHumanTakeover(randomUUID())).toBe(false);
    const assigned = await assignConversation(chat.id, staff, { businessId, actorUserId: staff, expectedVersion: chat.version });
    expect(assigned).toEqual({ conversationId: chat.id, assigneeUserId: staff, handler: 'human', version: chat.version + 1 });
    expect(await isHumanTakeover(chat.id)).toBe(true);
    await expect(assignConversation(chat.id, staff, { businessId })).resolves.toEqual(assigned);
    await expect(assignConversation(chat.id, owner, { businessId, expectedVersion: chat.version })).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { currentVersion: assigned.version, holder: { userId: staff, displayName: 'Staff A' } },
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(businessId, { ...assigned, status: 'open', type: 'conversation.updated' });
    const { rows: notes } = await core.db.query(
      'SELECT kind FROM conversation_notes WHERE conversation_id = $1 AND business_id = $2', [chat.id, businessId],
    );
    expect(notes).toEqual([{ kind: 'handover' }]);
    const { rows: audits } = await core.db.query(
      'SELECT details FROM audit_events WHERE target_id = $1 AND business_id = $2 AND action = $3',
      [chat.id, businessId, 'conversation.assign'],
    );
    expect(audits).toEqual([{ details: { from: null, to: staff, handler: 'human' } }]);
    const returned = await assignConversation(chat.id, null, { businessId, actorUserId: owner });
    expect(returned).toEqual({ conversationId: chat.id, assigneeUserId: null, handler: 'ai', version: assigned.version + 1 });
    await expect(assignConversation(chat.id, null, { businessId })).resolves.toEqual(returned);
    expect(await isHumanTakeover(chat.id)).toBe(false);
  });

  test('rejects other businesses, inactive assignees and closed conversations', async () => {
    const chat = await newChat();
    await expect(assignConversation(chat.id, owner, { businessId: otherBusinessId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(assignConversation(chat.id, staffB, { businessId })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(assignConversation(chat.id, randomUUID(), { businessId })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await core.db.query("UPDATE memberships SET status = 'revoked' WHERE user_id = $1 AND business_id = $2", [staff, businessId]);
    try {
      await expect(assignConversation(chat.id, staff, { businessId })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    } finally {
      await core.db.query("UPDATE memberships SET status = 'active' WHERE user_id = $1 AND business_id = $2", [staff, businessId]);
    }
    const closed = await closedChat();
    await expect(assignConversation(closed, staff, { businessId })).rejects.toMatchObject({
      code: 'POLICY_BLOCKED', details: { reason: 'conversation_closed' },
    });
  });

  test('queues a handoff once, publishes and notifies once, and preserves an existing holder', async () => {
    const chat = await newChat();
    const notify = vi.spyOn(notifications, 'notify');
    const publish = vi.spyOn(core, 'publish');
    const input = { reason: 'customer_request', actor: 'ai' } as const;
    const handoff = () => requestHumanHandoff(chat.id, input, { businessId });
    const [first, second] = await Promise.all([handoff(), handoff()]);
    expect(first).toEqual({ conversationId: chat.id, assigneeUserId: null, handler: 'human', version: chat.version + 1 });
    expect(second).toEqual(first);
    expect(await isHumanTakeover(chat.id)).toBe(true);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      businessId, to: { permission: 'chat.takeover' }, type: 'chat.handoff', link: '/chat?c=' + chat.id,
      dedupKey: 'handoff:' + chat.id + ':v' + first.version,
    }));
    const audit = await core.db.one<{ details: unknown }>(
      'SELECT details FROM audit_events WHERE target_id = $1 AND business_id = $2 AND action = $3',
      [chat.id, businessId, 'conversation.handoff.requested'],
    );
    expect(audit.details).toEqual(input);
    const assigned = await assignConversation(chat.id, staff, { businessId });
    await expect(handoff()).resolves.toEqual(assigned);
    await expect(requestHumanHandoff(chat.id, input, { businessId: otherBusinessId })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(requestHumanHandoff(await closedChat(), input, { businessId })).rejects.toMatchObject({ code: 'POLICY_BLOCKED' });
    expect(notify).toHaveBeenCalledTimes(1);
    const notes = await core.db.one<{ count: number }>(
      "SELECT count(*)::int AS count FROM conversation_notes WHERE conversation_id = $1 AND business_id = $2 AND kind = 'handover'",
      [chat.id, businessId],
    );
    expect(notes.count).toBe(2);
    expect((await getHistory(chat.id, { businessId })).items).toHaveLength(1);
  });
});

describe('team routes', () => {
  test('serializes simultaneous claims, reports the holder, and permits force and return by another member', async () => {
    const chat = await newChat();
    const staffAgent = await createTestAgent();
    const ownerAgent = await createTestAgent();
    await loginAs(staffAgent, 'staff.a@example.test');
    await loginAs(ownerAgent, 'owner.a@example.test');
    const path = chatPath(chat.id);
    const claim = (agent: typeof staffAgent) => agent.post(path + '/takeover').set(csrf, 'nless').send({});
    const results = await Promise.all([claim(staffAgent), claim(ownerAgent)]);
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    const staffWon = results[0].status === 200;
    const winner = staffWon ? staff : owner;
    const winnerAgent = staffWon ? staffAgent : ownerAgent;
    const loserAgent = staffWon ? ownerAgent : staffAgent;
    expect(results.find((result) => result.status === 409)?.body.error).toMatchObject({
      code: 'VERSION_CONFLICT', details: { reason: 'conversation_taken', currentVersion: chat.version + 1,
        holder: { userId: winner, displayName: staffWon ? 'Staff A' : 'Owner A' } },
    });
    const state = await loserAgent.get(path + '/team');
    expect(state.status).toBe(200);
    expect(state.body.data).toMatchObject({ assigneeUserId: winner, canTakeover: true, isQueued: false });
    const forced = await loserAgent.post(path + '/takeover').set(csrf, 'nless').send({ force: true, expectedVersion: state.body.data.version });
    expect(forced.status).toBe(200);
    expect(forced.body.data.assigneeUserId).toBe(staffWon ? owner : staff);
    const released = await winnerAgent.post(path + '/release').set(csrf, 'nless').send({ note: 'Synthetic test note' });
    expect(released.status).toBe(200);
    expect(released.body.data).toMatchObject({ handler: 'ai', assigneeUserId: null, version: chat.version + 3 });
    const again = await winnerAgent.post(path + '/release').set(csrf, 'nless').send({});
    expect(again.body.data).toEqual(released.body.data);
  });

  test('enforces route permissions and tenant isolation', async () => {
    const chat = await newChat();
    const foreign = await newChat(otherBusinessId);
    const agent = await createTestAgent();
    await loginAs(agent, 'staff.a@example.test');
    const wrongScope = '?businessId=' + otherBusinessId;
    expect((await agent.get(chatPath(chat.id) + '/team' + wrongScope)).status).toBe(404);
    for (const action of ['takeover', 'release']) {
      expect((await agent.post(chatPath(chat.id) + '/' + action + wrongScope).set(csrf, 'nless').send({})).status).toBe(404);
    }
    for (const base of [chatPath(foreign.id), chatPath('invalid')]) {
      expect((await agent.get(base + '/team')).status).toBe(404);
      expect((await agent.post(base + '/takeover').set(csrf, 'nless').send({})).status).toBe(404);
      expect((await agent.post(base + '/release').set(csrf, 'nless').send({})).status).toBe(404);
    }
    await core.db.query(
      "UPDATE memberships SET permissions = array_remove(permissions, 'chat.takeover') WHERE user_id = $1 AND business_id = $2",
      [staff, businessId],
    );
    try {
      const path = chatPath(chat.id);
      expect((await agent.get(path + '/team')).body.data.canTakeover).toBe(false);
      expect((await agent.post(path + '/takeover').set(csrf, 'nless').send({})).status).toBe(403);
      expect((await agent.post(path + '/release').set(csrf, 'nless').send({})).status).toBe(403);
    } finally {
      await core.db.query(
        "UPDATE memberships SET permissions = array_append(permissions, 'chat.takeover') WHERE user_id = $1 AND business_id = $2",
        [staff, businessId],
      );
    }
  });

  test('gate step 5: the real routes pause and resume replies', async () => {
    const agent = await createTestAgent();
    await loginAs(agent, 'owner.a@example.test');
    const id = 'team-gate-' + randomUUID();
    const chat = (await inbound(id, true)).conversation;
    const path = chatPath(chat.id);
    const aiReplies = async () => {
      expect((await drainJobs()).dead).toBe(0);
      const history = await getHistory(chat.id, { businessId });
      return history.items.filter((message) => message.author === 'ai');
    };
    expect(await aiReplies()).toHaveLength(1);
    expect((await agent.post(path + '/takeover').set(csrf, 'nless').send({})).status).toBe(200);
    const during = await inbound(id, true);
    expect(await aiReplies()).toHaveLength(1);
    expect((await getHistory(chat.id, { businessId })).items.some((message) => message.id === during.message.id)).toBe(true);
    expect((await agent.post(path + '/release').set(csrf, 'nless').send({})).status).toBe(200);
    await inbound(id, true, businessId, 'What is the price of A-GAME-01?');
    const replies = await aiReplies();
    expect(replies).toHaveLength(2);
    expect(replies.at(-1)?.text).toMatch(/\bbaht\b/i);
  }, 30000);
});

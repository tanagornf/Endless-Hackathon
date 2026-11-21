import { randomUUID } from 'node:crypto';
import { SEED } from '@nless/shared/core/fixtures';
import type { MessagePart } from '@nless/shared/core/types';
import type { OutboundDelivery } from './types';
import { afterAll, expect, test, vi } from 'vitest';
import { saveMessage } from '../features/inbox/service';
import { assignConversation, requestHumanHandoff } from '../features/team/service';
import { registerChannelSender, sendToCustomer } from './channels';
import { closeDb, db } from './db';
import { createTestAgent, loginAs } from './test-utils';
import { drainJobs } from './worker';

afterAll(closeDb);

test('queued delivery rechecks AI-off and takeover and preserves only the current handoff acknowledgement', async () => {
  const owner = SEED.users.find(({ alias }) => alias === 'owner_a')!;
  const accountId = randomUUID();
  const businessId = randomUUID();
  await db.tx(async (tx) => {
    await tx.query('INSERT INTO accounts (id,name,owner_user_id) VALUES ($1,$2,$3)', [accountId, 'Delivery policy account', owner.id]);
    await tx.query('INSERT INTO businesses (id,account_id,name) VALUES ($1,$2,$3)', [businessId, accountId, 'Delivery policy shop']);
    await tx.query("INSERT INTO memberships (business_id,user_id,role) VALUES ($1,$2,'owner')", [businessId, owner.id]);
  });

  const agent = await createTestAgent();
  await loginAs(agent, owner.email);
  const setAi = (enabled: boolean) => agent.put('/api/v1/businesses/' + businessId + '/settings/ai')
    .set('X-Requested-With', 'nless').send({ enabled });
  const send = vi.fn(async (_delivery: OutboundDelivery) => ({ state: 'sent', mode: 'real' } as const));
  registerChannelSender('web', { channel: 'web', mode: 'real', send });

  const parts: MessagePart[] = [{ type: 'text', text: 'Synthetic delivery policy fixture' }];
  const newConversation = async () => (await saveMessage({
    businessId, customer: { channel: 'web', externalId: randomUUID() }, direction: 'inbound',
    author: 'customer', parts, triggerAi: false,
  })).conversation.id;
  const queueAck = async (conversationId: string) => {
    const assignment = await requestHumanHandoff(conversationId, { reason: 'customer_request', actor: 'ai' }, { businessId });
    const stored = await saveMessage({
      businessId, conversationId, direction: 'outbound', author: 'ai', parts, triggerAi: false,
      providerMeta: { nlessHandoffAckVersion: assignment.version },
    });
    return sendToCustomer(conversationId, parts, { businessId, messageId: stored.message.id });
  };
  const state = (messageId: string) => db.one('SELECT delivery_state,delivery_error FROM messages WHERE id=$1 AND business_id=$2', [messageId, businessId]);
  const suppressed = { delivery_state: 'failed', delivery_error: 'AI_DELIVERY_SUPPRESSED' };
  const sent = { delivery_state: 'sent', delivery_error: null };

  const switchedOff = await newConversation();
  const offReply = await sendToCustomer(switchedOff, parts, { businessId, author: 'ai' });
  const offAck = await queueAck(await newConversation());
  const staff = await sendToCustomer(switchedOff, parts, { businessId, author: 'staff', authorUserId: owner.id });
  const system = await sendToCustomer(switchedOff, parts, { businessId, author: 'system' });
  expect((await setAi(false)).status).toBe(200);
  await drainJobs({ type: 'core.deliver' });
  expect(await state(offReply.messageId)).toEqual(suppressed);
  expect(await state(offAck.messageId)).toEqual(suppressed);
  expect(await state(staff.messageId)).toEqual(sent);
  expect(await state(system.messageId)).toEqual(sent);

  expect((await setAi(true)).status).toBe(200);
  const manualTakeover = await newConversation();
  const takeoverReply = await sendToCustomer(manualTakeover, parts, { businessId, author: 'ai' });
  await assignConversation(manualTakeover, owner.id, { businessId });
  const waitingForStaff = await newConversation();
  const oldReply = await sendToCustomer(waitingForStaff, parts, { businessId, author: 'ai' });
  const currentAck = await queueAck(waitingForStaff);
  const staffTookOver = await newConversation();
  const staleAck = await queueAck(staffTookOver);
  await assignConversation(staffTookOver, owner.id, { businessId });
  const ordinaryReply = await sendToCustomer(await newConversation(), parts, { businessId, author: 'ai' });

  await drainJobs({ type: 'core.deliver' });
  expect(await state(takeoverReply.messageId)).toEqual(suppressed);
  expect(await state(oldReply.messageId)).toEqual(suppressed);
  expect(await state(staleAck.messageId)).toEqual(suppressed);
  expect(await state(currentAck.messageId)).toEqual(sent);
  expect(await state(ordinaryReply.messageId)).toEqual(sent);
  expect(send.mock.calls.map(([delivery]) => delivery.messageId).sort()).toEqual([
    staff.messageId, system.messageId, currentAck.messageId, ordinaryReply.messageId,
  ].sort());
}, 30_000);

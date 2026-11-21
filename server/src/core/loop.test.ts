import { randomUUID } from 'node:crypto';
import { afterAll, expect, test } from 'vitest';
import type { MessageRecord } from '@nless/shared/features/inbox/types';
import { closeDb } from './db';
import { seedId } from './seed';
import { createTestAgent, drainJobs, loginAs, simulateInbound } from './test-utils';

afterAll(closeDb);
test('stores a canonical-price reply and stops responding after human takeover', async () => {
  const agent = await createTestAgent();
  await loginAs(agent, 'owner.a@example.test');
  const business = seedId('biz_demo_a');
  const marker = 'core-loop-' + randomUUID();
  const first = await simulateInbound(agent, business, 'A-GAME-01 ราคาเท่าไหร่', marker);
  const path = '/api/dev/conversations/' + first.conversation.id;
  expect((await drainJobs()).dead).toBe(0);
  const replies = (await agent.get(path + '/messages')).body.data.items as MessageRecord[];
  expect(replies.find((message) => message.author === 'ai')?.text).toContain('1,490');
  expect(replies.find((message) => message.author === 'ai')?.delivery.state).toBe('sent');
  const takeover = await agent.post(path + '/assign').set('X-Requested-With', 'nless').send({ userEmail: 'staff.a@example.test' });
  expect(takeover.status).toBe(200);
  const second = await simulateInbound(agent, business, 'A-GAME-01', marker);
  expect((await drainJobs()).dead).toBe(0);
  const later = (await agent.get(path + '/messages')).body.data.items as MessageRecord[];
  expect(later.some((message) => message.id === second.message.id)).toBe(true);
  expect(later.filter((message) => message.author === 'ai')).toHaveLength(1);
}, 15000);

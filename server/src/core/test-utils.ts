import request from 'supertest';
import { createApp } from './app';
import type { ApiResult } from '@nless/shared/core/types';
import type { SaveMessageResult } from '@nless/shared/features/inbox/types';

export { drainJobs } from './worker';
export async function createTestAgent() {
  return request.agent(await createApp());
}
type Agent = Awaited<ReturnType<typeof createTestAgent>>;

export async function loginAs(agent: Agent, email: string) {
  const response = await agent.post('/api/dev/login').set('X-Requested-With', 'nless').send({ email });
  if (response.status !== 200) throw new Error('Test login returned HTTP ' + response.status);
  return response;
}
export async function simulateInbound(agent: Agent, businessId: string, text: string, externalId?: string) {
  const response = await agent.post('/api/dev/simulate-inbound').set('X-Requested-With', 'nless')
    .send({ businessId, text, customerExternalId: externalId });
  if (response.status !== 200) throw new Error('Test inbound returned HTTP ' + response.status);
  return (response.body as ApiResult<SaveMessageResult>).data;
}

export function testGate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, resolve: open };
}

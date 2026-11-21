import { config } from '../server/src/core/config';
import { SEED } from '@nless/shared/core/fixtures';
import type { MessageRecord, SaveMessageResult } from '@nless/shared/features/inbox/types';
import type { ApiResult, Page } from '@nless/shared/core/types';

const base = process.env.SMOKE_BASE_URL ?? 'http://localhost:' + config.API_PORT;
let cookie = '';
type Row = { check: string; result: 'PASS' | 'FAIL' };
const checks: Row[] = [];
async function check(name: string, task: () => Promise<boolean>) {
  try { checks.push({ check: name, result: await task() ? 'PASS' : 'FAIL' }); }
  catch { checks.push({ check: name, result: 'FAIL' }); }
}
async function request(path: string, body?: unknown): Promise<Response> {
  const headers = new Headers({ 'X-Requested-With': 'nless' });
  if (cookie) headers.set('Cookie', cookie);
  if (config.DEV_LOGIN_TOKEN) headers.set('X-Dev-Login-Token', config.DEV_LOGIN_TOKEN);
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
}
async function data<T>(path: string, body?: unknown): Promise<T> {
  const response = await request(path, body);
  if (!response.ok) throw Error('Request failed');
  return (await response.json() as ApiResult<T>).data;
}
const a = SEED.businesses.find((shop) => shop.alias === 'biz_demo_a')!.id;
const b = SEED.businesses.find((shop) => shop.alias === 'biz_demo_b')!.id;
const outside = 'smoke-' + Date.now();
let conversationId = '';
const inbound = () => data<SaveMessageResult>('/api/dev/simulate-inbound', { businessId: a, text: 'A-GAME-01 ราคาเท่าไหร่ครับ', customerExternalId: outside });
const history = () => data<Page<MessageRecord>>('/api/dev/conversations/' + conversationId + '/messages');
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

await check('Owner A dev login', async () => {
  const response = await request('/api/dev/login', { email: 'owner.a@example.test' });
  cookie = response.headers.getSetCookie()[0]?.split(';')[0] ?? '';
  return response.ok && Boolean(cookie);
});
await check('31 loaded features', async () => {
  const items = await data<{ loaded: boolean }[]>('/api/v1/_meta/features');
  return items.length === 31 && items.every((item) => item.loaded);
});
await check('29 feature flags', async () => (await data<{ items: object[] }>('/api/v1/features')).items.length === 29);
await check('Shop B returns 404 for owner A', async () => (await request('/api/v1/businesses/' + b)).status === 404);
await check('Inbound reply shows 1,490 and is sent', async () => {
  conversationId = (await inbound()).conversation.id;
  const end = Date.now() + 5000;
  do {
    const messages = await history();
    if (messages.items.some((item) => item.author === 'ai' && item.text.includes('1,490') && item.delivery.state === 'sent')) return true;
    await sleep(200);
  } while (Date.now() < end);
  return false;
});
await check('Human takeover stores new inbound and silences the AI', async () => {
  if (!conversationId) return false;
  await data('/api/dev/conversations/' + conversationId + '/assign', { userEmail: 'staff.a@example.test' });
  const result = await inbound();
  await sleep(3000);
  const messages = (await history()).items;
  return messages.some((message) => message.id === result.message.id) && !messages.some((message) => message.author === 'ai' && message.seq > result.message.seq);
});
console.table(checks);
if (checks.some((row) => row.result === 'FAIL')) process.exitCode = 1;

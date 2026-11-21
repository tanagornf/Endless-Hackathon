/// <reference types="node" />
import { test, expect } from '../../../../../tests/e2e/fixtures';
import { SEED } from '@nless/shared/core/fixtures';
import type { ApiResult, BusinessRecord } from '@nless/shared/core/types';
import type { LineConnectionView } from '@nless/shared/features/line/types';

test('unknown LINE webhook is safely acknowledged', async ({ request }) => {
  const unknown = await request.post('/webhooks/line/99999999999999999999', {
    data: { destination: 'synthetic', events: [] },
  });
  expect(unknown.status()).toBe(200);
});

test('production LINE connection verifies and rejects an unsigned webhook', async ({ api, request }) => {
  const whoami = await api.get('/api/v1/me');
  expect(whoami.ok()).toBeTruthy();
  const identity = await whoami.json() as ApiResult<{ businesses: { business: BusinessRecord }[] }>;
  const demoId = SEED.businesses.find((shop) => shop.alias === 'biz_demo_a')?.id;
  const ownerBusiness = identity.data.businesses.find((entry) => entry.business.id === demoId);
  expect(ownerBusiness).toBeDefined();
  const path = '/api/v1/businesses/' + ownerBusiness!.business.id + '/channels/line';
  const info = await api.get(path);
  expect(info.ok()).toBeTruthy();
  const before = (await info.json() as ApiResult<LineConnectionView>).data;
  expect(before).toMatchObject({ connected: true, mode: 'real' });
  const webhook = '/webhooks/line/' + before.channelId;
  expect(before.webhookUrl).toContain(webhook);
  const unsigned = await request.post(webhook, { data: { destination: 'synthetic', events: [] } });
  expect(unsigned.status()).toBe(401);

  const verify = await api.post(path + '/verify');
  expect(verify.ok()).toBeTruthy();
  const after = (await verify.json() as ApiResult<LineConnectionView>).data;
  expect(after.status).toBe('active');
  expect(after.lastVerifiedAt).not.toBe(before.lastVerifiedAt);
  const events = await api.get(path + '/events?limit=5');
  expect(events.ok()).toBeTruthy();
  expect((await events.json()).data.items).toBeInstanceOf(Array);
});

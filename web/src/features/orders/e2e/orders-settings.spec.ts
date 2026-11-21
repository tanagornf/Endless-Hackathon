import { SEED } from '@nless/shared/core/fixtures';
import { expect, test } from '../../../../../tests/e2e/fixtures';

test('merchant reads its order settings and cannot read another shop', async ({ api }) => {
  const [shopA, shopB] = SEED.businesses;
  const path = (businessId: string) => '/api/v1/businesses/' + businessId + '/orders/settings';
  const own = await api.get(path(shopA.id), { headers: { 'Accept-Language': 'en' } });
  expect(own.status()).toBe(200);
  expect((await own.json()).data).toMatchObject({ businessId: shopA.id, enabled: expect.any(Boolean),
    shippingFeeMinor: expect.any(Number), version: expect.any(Number) });
  expect((await api.get(path(shopB.id))).status()).toBe(404);
});

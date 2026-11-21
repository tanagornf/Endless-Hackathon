import { expect, test } from '../../../../../tests/e2e/fixtures';
import { SEED } from '@nless/shared/core/fixtures';
test('merchant reads its payment settings; public invalid links disclose no order',async ({api})=>{
  const [own,other]=SEED.businesses;
  const path=(id:string)=>'/api/v1/businesses/'+id+'/payments/settings';
  const result=await api.get(path(own.id),{headers:{'Accept-Language':'en'}});
  expect(result.status()).toBe(200);
  expect((await result.json()).data).toMatchObject({businessId:own.id,configured:expect.any(Boolean)});
  expect((await api.get(path(other.id))).status()).toBe(404);
  expect((await api.get('/api/v1/public/payments/invalid')).status()).toBe(404);
});

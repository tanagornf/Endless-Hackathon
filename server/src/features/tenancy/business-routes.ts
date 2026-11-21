import type { FeatureApi } from '../../core';
import { CreateBusinessBody, DeleteBusinessQuery } from './business-input';
import { createBusiness, deleteBusiness, listMyBusinesses } from './businesses';

export function registerBusinessRoutes(api: FeatureApi): void {
  api.get('/businesses', { auth: 'user', summary: 'List your businesses' },
    async ({ user }) => listMyBusinesses(user!.id));
  api.post('/businesses', { auth: 'user', body: CreateBusinessBody, summary: 'Create a business in your account' },
    async ({ user, body }) => ({ kind: 'json', status: 201, data: await createBusiness(user!.id, body) }));
  api.delete('/businesses/:businessId', {
    auth: 'business', permission: 'account.businesses', query: DeleteBusinessQuery, summary: 'Delete a business',
  }, async ({ business, user, query }) => {
    await deleteBusiness(business!.id, user!.id, query.confirmName);
    return { kind: 'no_content' };
  });
}

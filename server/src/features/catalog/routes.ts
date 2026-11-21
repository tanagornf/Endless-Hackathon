import { defineFeatureRoutes } from '../../core';
import { ListQuery } from './schema';
import { listItems } from './service';

export default defineFeatureRoutes({
  featureId: 'F08',
  slug: 'catalog',
  register(api) {
    api.get('/businesses/:businessId/catalog/items',
      { auth: 'business', permission: 'product.read', query: ListQuery, summary: 'List catalog items' },
      async ({ business, query }) => listItems(business!.id, query));
  },
});

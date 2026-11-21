import { defineFeatureRoutes } from '../../core';
import { CreateItemBody, ListQuery, PatchItemBody } from './schema';
import { createItem, getItemAdmin, listItems, patchItem } from './service';

const items = '/businesses/:businessId/catalog/items';
const read = { auth: 'business', permission: 'product.read' } as const;
const write = { auth: 'business', permission: 'product.write' } as const;

export default defineFeatureRoutes({
  featureId: 'F08',
  slug: 'catalog',
  register(api) {
    api.get(items, { ...read, query: ListQuery, summary: 'List catalog items' },
      async ({ business, query }) => listItems(business!.id, query));
    api.get(items + '/:itemId', { ...read, summary: 'Read catalog item' },
      async ({ business, params }) => getItemAdmin(business!.id, params.itemId));
    api.post(items, { ...write, body: CreateItemBody, summary: 'Create catalog item' },
      async ({ business, user, body }) => ({
        kind: 'json', status: 201, data: await createItem(business!.id, { userId: user!.id }, body),
      }));
    api.patch(items + '/:itemId', { ...write, body: PatchItemBody, summary: 'Update catalog item' },
      async ({ business, user, params, body }) => patchItem(business!.id, { userId: user!.id }, params.itemId, body));
  },
});

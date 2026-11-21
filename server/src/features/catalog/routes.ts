import { defineFeatureRoutes } from '../../core';
import { CreateItemBody, ListQuery, PatchItemBody, SkuCheckQuery } from './schema';
import { checkSku, createItem, deleteItem, getHistory, getItemAdmin, listCategories, listItems, patchItem } from './service';

const root = '/businesses/:businessId/catalog';
const items = root + '/items';
const read = { auth: 'business', permission: 'product.read' } as const;
const write = { auth: 'business', permission: 'product.write' } as const;
const remove = { auth: 'business', permission: 'product.delete' } as const;

export default defineFeatureRoutes({
  featureId: 'F08',
  slug: 'catalog',
  register(api) {
    api.get(items, { ...read, query: ListQuery, summary: 'List catalog items' },
      async ({ business, query }) => listItems(business!.id, query));
    api.get(root + '/sku-check', { ...read, query: SkuCheckQuery, summary: 'Check catalog SKU availability' },
      async ({ business, query }) => checkSku(business!.id, query.sku, query.excludeItemId));
    api.get(root + '/categories', { ...read, summary: 'List catalog categories' },
      async ({ business }) => listCategories(business!.id));
    api.get(items + '/:itemId', { ...read, summary: 'Read catalog item' },
      async ({ business, params }) => getItemAdmin(business!.id, params.itemId));
    api.get(items + '/:itemId/history', { ...read, summary: 'Read catalog price and stock history' },
      async ({ business, params }) => getHistory(business!.id, params.itemId));
    api.post(items, { ...write, body: CreateItemBody, summary: 'Create catalog item' },
      async ({ business, user, body }) => ({
        kind: 'json', status: 201, data: await createItem(business!.id, { userId: user!.id }, body),
      }));
    api.patch(items + '/:itemId', { ...write, body: PatchItemBody, summary: 'Update catalog item' },
      async ({ business, user, params, body }) => patchItem(business!.id, { userId: user!.id }, params.itemId, body));
    api.delete(items + '/:itemId', { ...remove, summary: 'Delete catalog item' },
      async ({ business, user, params }) => deleteItem(business!.id, { userId: user!.id }, params.itemId));
  },
});

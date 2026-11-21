import { orderOutbox } from './outbox';
import { z } from 'zod';
import { packingDay, packingList, packingUpdate, updatePacking } from './packing';
import { defineFeatureRoutes } from '../../core';
import { getOrderSettings, updateOrderSettings, updateSettingsBody } from './settings';

const settings = '/businesses/:businessId/orders/settings';

export default defineFeatureRoutes({
  featureId: 'F13',
  slug: 'orders',
  jobs: { 'orders.outbox': orderOutbox },
  register(api) {
    const queue = '/businesses/:businessId/orders/packing';
    api.get(queue, { auth: 'business', permission: 'orders.read', query: packingDay, summary: 'Read the shop packing sheet' },
      async ({ business, query }) => packingList(business!.id, query.day));
    api.put(queue + '/:orderId', { auth: 'business', permission: 'orders.write', body: packingUpdate, summary: 'Update shipment details' },
      async ({ business, user, params, body }) => updatePacking(business!.id, user!.id, z.string().uuid().parse(params.orderId), body));
    api.get(settings, { auth: 'business', permission: 'orders.read', summary: 'Read order settings' },
      async ({ business }) => getOrderSettings(business!.id));
    api.put(settings, { auth: 'business', permission: 'business.commerce', body: updateSettingsBody, summary: 'Update order settings' },
      async ({ business, user, body }) => updateOrderSettings(business!.id, user!.id, body));
  },
});

import { orderOutbox } from './outbox';
import { defineFeatureRoutes } from '../../core';
import { getOrderSettings, updateOrderSettings, updateSettingsBody } from './settings';

const settings = '/businesses/:businessId/orders/settings';

export default defineFeatureRoutes({
  featureId: 'F13',
  slug: 'orders',
  jobs: { 'orders.outbox': orderOutbox },
  register(api) {
    api.get(settings, { auth: 'business', permission: 'orders.read', summary: 'Read order settings' },
      async ({ business }) => getOrderSettings(business!.id));
    api.put(settings, { auth: 'business', permission: 'business.commerce', body: updateSettingsBody, summary: 'Update order settings' },
      async ({ business, user, body }) => updateOrderSettings(business!.id, user!.id, body));
  },
});

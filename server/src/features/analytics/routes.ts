import { defineFeatureRoutes } from '../../core';
import { rangeQuery } from './range';
import { getDashboard, getSettings, updateSettings, updateSettingsBody } from './service';

const root = '/businesses/:businessId/analytics';
const read = { auth: 'business', permission: 'insights.read' } as const;

export default defineFeatureRoutes({
  featureId: 'F27',
  slug: 'analytics',
  register(api) {
    api.get(root + '/dashboard', { ...read, query: rangeQuery, summary: 'Read the LINE shop overview' },
      async ({ business, query }) => getDashboard(business!.id, business!.timezone, query));
    api.get(root + '/impact', { ...read, query: rangeQuery, summary: 'Read the LINE shop impact' },
      async ({ business, query }) => (await getDashboard(business!.id, business!.timezone, query)).impact);
    api.get(root + '/settings', { ...read, summary: 'Read shop estimate settings' },
      async ({ business }) => getSettings(business!.id));
    api.put(root + '/settings', { auth: 'business', permission: 'business.bot_settings', body: updateSettingsBody, summary: 'Update shop estimate settings' },
      async ({ business, user, body }) => updateSettings(business!.id, user!.id, body));
  },
});

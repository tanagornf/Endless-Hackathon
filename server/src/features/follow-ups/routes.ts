import { defineFeatureRoutes } from '../../core';
import { getSettings, updateSettings } from './service';

const settingsPath = '/businesses/:businessId/follow-ups/settings';

export default defineFeatureRoutes({
  featureId: 'F38',
  slug: 'follow-ups',
  register(api) {
    api.get(settingsPath, { auth: 'business', permission: 'chat.read', summary: 'Read follow-up settings' },
      async ({ business }) => getSettings(business!.id));
    api.put(settingsPath, { auth: 'business', permission: 'business.bot_settings', summary: 'Update follow-up settings' },
      async ({ body, business, user }) => updateSettings(business!.id, user!.id, body));
  },
});

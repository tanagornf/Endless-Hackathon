import { defineFeatureRoutes } from '../../core';
import { AiSwitchBody, parseSettingsInput } from './schemas';
import { getSettingsView, setAiEnabled } from './service';

const settingsPath = '/businesses/:businessId/settings';

export default defineFeatureRoutes({
  featureId: 'F04',
  slug: 'business-settings',
  register(api) {
    api.get(settingsPath, {
      auth: 'business', permission: 'business.read', summary: 'Read business settings',
    }, async (ctx) => getSettingsView(ctx.business!.id));
    api.put(settingsPath + '/ai', {
      auth: 'business', permission: 'business.bot_settings', summary: 'Set the business AI switch',
    }, async (ctx) => {
      const { enabled } = parseSettingsInput(AiSwitchBody, ctx.body);
      return setAiEnabled(ctx.business!.id, enabled, ctx.user!.id);
    });
  },
});

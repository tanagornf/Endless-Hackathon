import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F04',
  slug: 'business-settings',
  routes: [
    {
      path: '/bot-settings',
      permission: 'business.read',
      titleKey: 'business-settings:bot.title',
      load: () => import('./BotSettingsPage'),
    },
  ],
  menu: [
    {
      path: '/bot-settings',
      group: 'settings',
      labelKey: 'business-settings:menu.bot',
      icon: 'SmartToyOutlined',
      order: 20,
      permission: 'business.read',
      searchTerms: ['บอท', 'AI', 'ปิด AI', 'นโยบาย', 'bot', 'policy'],
    },
  ],
});

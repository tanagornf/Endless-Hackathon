import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F04',
  slug: 'business-settings',
  routes: [
    {
      path: '/business',
      permission: 'business.read',
      titleKey: 'business-settings:business.title',
      load: () => import('./BusinessPage'),
    },
    {
      path: '/bot-settings',
      permission: 'business.read',
      titleKey: 'business-settings:bot.title',
      load: () => import('./BotSettingsPage'),
    },
  ],
  menu: [
    {
      path: '/business',
      group: 'settings',
      labelKey: 'business-settings:menu.business',
      icon: 'StorefrontOutlined',
      order: 10,
      permission: 'business.read',
      searchTerms: ['ร้าน', 'ข้อมูลร้าน', 'เวลาทำการ', 'วันหยุด', 'business', 'hours'],
    },
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

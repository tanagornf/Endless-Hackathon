import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F17',
  slug: 'line',
  routes: [
    { path: '/channels', permission: 'business.read', titleKey: 'line:page.title', load: () => import('./LineChannelPage') },
  ],
  menu: [
    { path: '/channels', group: 'settings', labelKey: 'line:menu.title', icon: 'ChatOutlined', order: 20,
      permission: 'business.read', searchTerms: ['line', 'ไลน์', 'ช่องทาง', 'channel', 'webhook'] },
  ],
});

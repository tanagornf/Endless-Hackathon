import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F09',
  slug: 'inbox',
  routes: [
    { path: '/chat/history/:conversationId', permission: 'chat.read', load: () => import('./HistoryPage') },
    { path: '/chat', load: () => import('./InboxPage'), permission: 'chat.read', titleKey: 'inbox:page.title' },
    { path: '/demo-chat', load: () => import('./DemoChatTester'), permission: 'insights.demo', titleKey: 'inbox:menu.entry1' },
    { path: '/demo-chat/s/:slug', load: () => import('./PublicDemoChat'), layout: 'public', auth: 'none', titleKey: 'inbox:menu.entry1' },
  ],
  menu: [
    {
      path: '/chat', labelKey: 'inbox:menu.title', group: 'chat', icon: 'ForumOutlined',
      order: 10, permission: 'chat.read', mobileTab: true,
      searchTerms: ['แชต', 'ข้อความ', 'inbox', 'chat'],
    },
    {
      path: '/demo-chat', labelKey: 'inbox:menu.entry1', group: 'ai', icon: 'SmartToyOutlined',
      order: 30, permission: 'insights.demo', searchTerms: ['demo', 'ทดลอง', 'เดโม'],
    },
  ],
});

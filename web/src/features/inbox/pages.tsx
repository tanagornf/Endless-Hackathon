import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F09',
  slug: 'inbox',
  routes: [
    { path: '/chat/history/:conversationId', permission: 'chat.read', load: () => import('./HistoryPage') },
    { path: '/chat', load: () => import('./InboxPage'), permission: 'chat.read', titleKey: 'inbox:page.title' },
  ],
  menu: [
    {
      path: '/chat', labelKey: 'inbox:menu.title', group: 'chat', icon: 'ForumOutlined',
      order: 10, permission: 'chat.read', mobileTab: true,
      searchTerms: ['แชต', 'ข้อความ', 'inbox', 'chat'],
    },
  ],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F09',
  slug: 'inbox',
  routes: [
    { path: '/chat/history/:conversationId', permission: 'chat.read', load: () => import('./HistoryPage') },
  ],
  menu: [],
});

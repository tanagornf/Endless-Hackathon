import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F11',
  slug: 'team',
  routes: [{ path: '/team', permission: 'chat.read', load: () => import('./TeamRedirect') }],
  slots: [
    { slot: 'chatSidePanels', id: 'team.panel', order: 10, permission: 'chat.read', load: () => import('./ConversationPanel') },
    { slot: 'chatComposerActions', id: 'team.quick', order: 10, permission: 'chat.read', load: () => import('./QuickActions') },
  ],
});

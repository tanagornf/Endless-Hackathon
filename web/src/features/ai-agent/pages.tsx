import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F10',
  slug: 'ai-agent',
  routes: [{ path: '/ai-settings', load: () => import('./AiTurnsPage'), permission: 'chat.read', titleKey: 'ai-agent:page.title' }],
  menu: [{ path: '/ai-settings', labelKey: 'ai-agent:menu.title', group: 'ai', icon: 'SmartToyOutlined', order: 10,
    permission: 'chat.read', searchTerms: ['AI', 'ตอบอัตโนมัติ', 'trace', 'turn'] }],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F05',
  slug: 'knowledge',
  routes: [
    { path: '/knowledge', permission: 'product.read', titleKey: 'knowledge:page.title', load: () => import('./KnowledgeListPage') },
    { path: '/knowledge/:itemId', permission: 'product.read', titleKey: 'knowledge:page.title', load: () => import('./KnowledgeEditPage') },
  ],
  menu: [{
    path: '/knowledge', group: 'knowledge', labelKey: 'knowledge:menu.title', icon: 'MenuBookOutlined', order: 10,
    permission: 'product.read', searchTerms: ['knowledge', 'ความรู้', 'faq', 'คำถามที่พบบ่อย', 'เอกสาร'],
  }],
});

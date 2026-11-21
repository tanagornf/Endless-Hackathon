import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F06',
  slug: 'knowledge-import',
  routes: [
    { path: '/imports', permission: 'product.read', titleKey: 'knowledge-import:page.title', load: () => import('./ImportsPage') },
    { path: '/imports/:importId', permission: 'product.read', titleKey: 'knowledge-import:page.title', load: () => import('./ImportDetailPage') },
  ],
  menu: [
    { path: '/imports', group: 'knowledge', labelKey: 'knowledge-import:menu.title', icon: 'UploadFileOutlined', order: 30, permission: 'product.read',
      searchTerms: ['import', 'นำเข้า', 'csv', 'tsv', 'ชีต', 'อัปโหลด'] },
  ],
  slots: [
    { slot: 'knowledgeActions', id: 'knowledge-import.button', order: 20, permission: 'product.write', load: () => import('./ImportButton') },
  ],
});

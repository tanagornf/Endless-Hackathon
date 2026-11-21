import { defineFeaturePages } from '../../core';
export default defineFeaturePages({
  featureId: 'F24', slug: 'crm',
  routes: [{ path: '/customers', permission: 'chat.read', titleKey: 'crm:page.title', load: () => import('./CustomersPage') }, { path: '/customers/:customerId', permission: 'chat.read', titleKey: 'crm:panel.title', load: () => import('./CustomerDetailPage') }],
  menu: [{ path: '/customers', group: 'customers', labelKey: 'crm:menu.title', icon: 'PeopleAltOutlined', order: 10, searchTerms: ['ลูกค้า', 'crm', 'แท็ก', 'tag', 'customer'], permission: 'chat.read' }],
  slots: [{ slot: 'chatSidePanels', id: 'crm.customer-panel', labelKey: 'crm:panel.title', order: 10, permission: 'chat.read', load: () => import('./CustomerPanel') }],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F27',
  slug: 'analytics',
  routes: [{ path: '/dashboard', permission: 'insights.read', titleKey: 'analytics:dashboard.title', load: () => import('./DashboardPage') }],
  menu: [{ path: '/dashboard', group: 'home', labelKey: 'analytics:menu.dashboard', icon: 'DashboardOutlined', order: 10,
    permission: 'insights.read', searchTerms: ['dashboard', 'overview', 'ภาพรวม', 'ผลลัพธ์'] }],
});

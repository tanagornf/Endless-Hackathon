import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F03',
  slug: 'tenancy',
  routes: [
    { path: '/members', permission: 'account.members', titleKey: 'tenancy:members.title', load: () => import('./MembersPage') },
  ],
  menu: [{
    path: '/members', group: 'settings', labelKey: 'tenancy:menu.members', icon: 'GroupOutlined',
    order: 30, permission: 'account.members', searchTerms: ['สมาชิก', 'พนักงาน', 'สิทธิ์', 'members', 'permissions'],
  }],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F03',
  slug: 'tenancy',
  routes: [
    { path: '/members', permission: 'account.members', titleKey: 'tenancy:members.title', load: () => import('./MembersPage') },
    { path: '/invitations', permission: 'account.members', titleKey: 'tenancy:invitations.title', load: () => import('./InvitationsPage') },
    { path: '/invitations/accept', auth: 'none', layout: 'public', titleKey: 'tenancy:accept.title', load: () => import('./AcceptInvitationPage') },
  ],
  menu: [
    {
      path: '/members', group: 'settings', labelKey: 'tenancy:menu.members', icon: 'GroupOutlined',
      order: 30, permission: 'account.members', searchTerms: ['สมาชิก', 'พนักงาน', 'สิทธิ์', 'members', 'permissions'],
    },
    {
      path: '/invitations', group: 'settings', labelKey: 'tenancy:menu.invitations', icon: 'MarkEmailReadOutlined',
      order: 35, permission: 'account.members', searchTerms: ['คำเชิญ', 'เชิญ', 'invite'],
    },
  ],
});

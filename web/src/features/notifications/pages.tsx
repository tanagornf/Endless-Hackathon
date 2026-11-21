import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: 'F31',
  slug: 'notifications',
  routes: [
    { path: '/notifications', auth: 'business', titleKey: 'notifications:page.title', load: () => import('./NotificationsPage') },
  ],
  menu: [
    { path: '/notifications', group: 'home', labelKey: 'notifications:menu.title', icon: 'NotificationsNoneOutlined', order: 90,
      searchTerms: ['แจ้งเตือน', 'กระดิ่ง', 'notification', 'push'] },
  ],
  slots: [
    { slot: 'topbarActions', id: 'notifications.bell', order: 10, load: () => import('./NotificationBell') },
  ],
});

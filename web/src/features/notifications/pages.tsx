import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F31",
  slug: "notifications",
  routes: [
    { path: "/notifications", auth: 'user', load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/notifications", group: "help", labelKey: "notifications:menu.title", icon: "NotificationsOutlined", order: 280 },
  ],
});

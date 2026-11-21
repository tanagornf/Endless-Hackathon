import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F36",
  slug: "release",
  routes: [
    { path: "/release", auth: 'platform_admin', load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/release", group: "admin", labelKey: "release:menu.title", icon: "RocketLaunchOutlined", order: 290, platformAdminOnly: true },
  ],
});

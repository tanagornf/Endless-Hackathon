import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F17",
  slug: "line",
  routes: [
    { path: "/channels", permission: "business.channels", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/channels", group: "settings", labelKey: "line:menu.title", icon: "HubOutlined", order: 160, permission: "business.channels" },
  ],
});

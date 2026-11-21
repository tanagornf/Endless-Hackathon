import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F04",
  slug: "business-settings",
  routes: [
    { path: "/business", permission: "business.read", load: () => import("./Placeholder") },
    { path: "/bot-settings", permission: "business.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/business", group: "settings", labelKey: "business-settings:menu.title", icon: "StorefrontOutlined", order: 20, permission: "business.read" },
  ],
});

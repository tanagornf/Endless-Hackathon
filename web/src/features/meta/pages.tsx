import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F18",
  slug: "meta",
  routes: [
    { path: "/channels/meta", permission: "business.channels", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/channels/meta", group: "settings", labelKey: "meta:menu.title", icon: "FacebookOutlined", order: 170, permission: "business.channels" },
  ],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F11",
  slug: "team",
  routes: [
    { path: "/team", permission: "chat.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/team", group: "settings", labelKey: "team:menu.title", icon: "BadgeOutlined", order: 100, permission: "chat.read" },
  ],
});

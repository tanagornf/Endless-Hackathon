import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F38",
  slug: "follow-ups",
  routes: [
    { path: "/follow-ups", permission: "chat.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/follow-ups", group: "customers", labelKey: "follow-ups:menu.title", icon: "ScheduleSendOutlined", order: 260, permission: "chat.read" },
  ],
});

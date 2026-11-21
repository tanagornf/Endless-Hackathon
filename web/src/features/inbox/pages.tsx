import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F09",
  slug: "inbox",
  routes: [
    { path: "/chat", permission: "chat.read", load: () => import("./Placeholder") },
    { path: "/demo-chat", permission: "insights.demo", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/chat", group: "chat", labelKey: "inbox:menu.title", icon: "ForumOutlined", order: 70, permission: "chat.read" },
    { path: "/demo-chat", group: "ai", labelKey: "inbox:menu.entry1", icon: "SmartToyOutlined", order: 80, permission: "insights.demo" },
  ],
});

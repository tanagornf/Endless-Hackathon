import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F30",
  slug: "voice",
  routes: [
    { path: "/voice", permission: "insights.demo", load: () => import("./Placeholder") },
    { path: "/call", permission: "insights.demo", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/voice", group: "ai", labelKey: "voice:menu.title", icon: "MicOutlined", order: 240, permission: "insights.demo" },
  ],
});

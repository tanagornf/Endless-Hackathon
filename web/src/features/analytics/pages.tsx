import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F27",
  slug: "analytics",
  routes: [
    { path: "/dashboard", permission: "insights.read", load: () => import("./Placeholder") },
    { path: "/usage", permission: "insights.read", load: () => import("./Placeholder") },
    { path: "/traces", permission: "insights.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/dashboard", group: "home", labelKey: "analytics:menu.title", icon: "DashboardOutlined", order: 230, permission: "insights.read" },
  ],
});

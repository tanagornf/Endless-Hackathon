import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F37",
  slug: "evals",
  routes: [
    { path: "/ai-quality", permission: "insights.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/ai-quality", group: "insights", labelKey: "evals:menu.title", icon: "FactCheckOutlined", order: 250, permission: "insights.read" },
  ],
});

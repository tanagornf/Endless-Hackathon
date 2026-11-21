import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F26",
  slug: "insights",
  routes: [
    { path: "/insights", permission: "insights.read", load: () => import("./MerchantPage") },
  ],
  menu: [
    { path: "/insights", group: "insights", labelKey: "insights:menu.title", icon: "InsightsOutlined", order: 220, permission: "insights.read" },
  ],
});

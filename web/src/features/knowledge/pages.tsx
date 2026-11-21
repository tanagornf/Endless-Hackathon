import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F05",
  slug: "knowledge",
  routes: [
    { path: "/knowledge", permission: "product.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/knowledge", group: "knowledge", labelKey: "knowledge:menu.title", icon: "MenuBookOutlined", order: 30, permission: "product.read" },
  ],
});

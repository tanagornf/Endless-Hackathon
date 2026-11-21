import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F08",
  slug: "catalog",
  routes: [
    { path: "/catalog", permission: "product.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/catalog", group: "knowledge", labelKey: "catalog:menu.title", icon: "Inventory2Outlined", order: 60, permission: "product.read" },
  ],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F07",
  slug: "knowledge-search",
  routes: [
    { path: "/knowledge-search", permission: "product.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/knowledge-search", group: "knowledge", labelKey: "knowledge-search:menu.title", icon: "ManageSearchOutlined", order: 50, permission: "product.read" },
  ],
});

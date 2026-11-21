import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F39",
  slug: "chatgpt-catalog",
  routes: [
    { path: "/chatgpt-catalog", permission: "product.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/chatgpt-catalog", group: "knowledge", labelKey: "chatgpt-catalog:menu.title", icon: "ShoppingBagOutlined", order: 270, permission: "product.read" },
  ],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F13",
  slug: "orders",
  routes: [
    { path: "/orders", permission: "orders.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/orders", group: "commerce", labelKey: "orders:menu.title", icon: "ReceiptLongOutlined", order: 120, permission: "orders.read" },
  ],
});

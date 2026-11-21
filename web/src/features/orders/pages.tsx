import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F13",
  slug: "orders",
  routes: [
    { path: "/orders/packing", permission: "orders.read", titleKey: "orders:pack.title", load: () => import("./PackingPage") },
    { path: "/orders", permission: "orders.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/orders/packing", group: "commerce", labelKey: "orders:pack.title", icon: "ReceiptLongOutlined", order: 121, permission: "orders.read" },
    { path: "/orders", group: "commerce", labelKey: "orders:menu.title", icon: "ReceiptLongOutlined", order: 120, permission: "orders.read" },
  ],
});

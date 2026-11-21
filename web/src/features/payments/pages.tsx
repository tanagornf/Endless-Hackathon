import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F14",
  slug: "payments",
  routes: [
    { path: "/payments", permission: "orders.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/payments", group: "commerce", labelKey: "payments:menu.title", icon: "PaymentsOutlined", order: 130, permission: "orders.read" },
  ],
});

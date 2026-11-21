import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F22",
  slug: "live-commerce",
  routes: [
    { path: "/product-codes", permission: "product.read", load: () => import("./Placeholder") },
    { path: "/live", permission: "product.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/product-codes", group: "live", labelKey: "live-commerce:menu.title", icon: "QrCode2Outlined", order: 190, permission: "product.read" },
  ],
});

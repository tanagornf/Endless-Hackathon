import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F06",
  slug: "knowledge-import",
  routes: [
    { path: "/imports", permission: "product.write", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/imports", group: "knowledge", labelKey: "knowledge-import:menu.title", icon: "UploadFileOutlined", order: 40, permission: "product.write" },
  ],
});

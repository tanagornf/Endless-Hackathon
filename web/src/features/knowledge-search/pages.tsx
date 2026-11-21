import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F07",
  slug: "knowledge-search",
  routes: [
    { path: "/knowledge-search", permission: "product.read", titleKey: "knowledge-search:page.title", load: () => import("./KnowledgeSearchPage") },
  ],
  menu: [
    { path: "/knowledge-search", group: "knowledge", labelKey: "knowledge-search:menu.title", icon: "ManageSearchOutlined", order: 20,
      permission: "product.read", searchTerms: ["search", "ค้นหา", "rag", "ทดสอบการค้นหา", "recall"] },
  ],
});

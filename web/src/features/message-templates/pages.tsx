import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F12",
  slug: "message-templates",
  routes: [
    { path: "/templates", permission: "chat.reply", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/templates", group: "knowledge", labelKey: "message-templates:menu.title", icon: "TextSnippetOutlined", order: 110, permission: "chat.reply" },
  ],
});

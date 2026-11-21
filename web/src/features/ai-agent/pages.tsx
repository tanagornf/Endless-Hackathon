import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F10",
  slug: "ai-agent",
  routes: [
    { path: "/ai-settings", permission: "business.bot_settings", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/ai-settings", group: "ai", labelKey: "ai-agent:menu.title", icon: "TuneOutlined", order: 90, permission: "business.bot_settings" },
  ],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F23",
  slug: "broadcast",
  routes: [
    { path: "/broadcast", permission: "broadcast.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/broadcast", group: "customers", labelKey: "broadcast:menu.title", icon: "CampaignOutlined", order: 200, permission: "broadcast.read" },
  ],
});

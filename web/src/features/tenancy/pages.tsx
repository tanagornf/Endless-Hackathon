import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F03",
  slug: "tenancy",
  routes: [
    { path: "/members", permission: "account.members", load: () => import("./Placeholder") },
    { path: "/invitations", permission: "account.members", load: () => import("./Placeholder") },
    { path: "/businesses", permission: "account.members", load: () => import("./Placeholder") },
    { path: "/onboarding", auth: 'user', permission: "account.members", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/members", group: "settings", labelKey: "tenancy:menu.title", icon: "GroupOutlined", order: 10, permission: "account.members" },
  ],
});

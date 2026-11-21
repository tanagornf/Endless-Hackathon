import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F24",
  slug: "crm",
  routes: [
    { path: "/customers", permission: "chat.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/customers", group: "customers", labelKey: "crm:menu.title", icon: "PeopleAltOutlined", order: 210, permission: "chat.read" },
  ],
});

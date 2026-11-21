import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F15",
  slug: "booking",
  routes: [
    { path: "/appointments", permission: "appointments.read", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/appointments", group: "commerce", labelKey: "booking:menu.title", icon: "EventAvailableOutlined", order: 140, permission: "appointments.read" },
  ],
});

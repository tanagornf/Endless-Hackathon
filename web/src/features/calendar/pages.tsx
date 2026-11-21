import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F16",
  slug: "calendar",
  routes: [
    { path: "/calendar", permission: "appointments.settings", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/calendar", group: "commerce", labelKey: "calendar:menu.title", icon: "CalendarMonthOutlined", order: 150, permission: "appointments.settings" },
  ],
});

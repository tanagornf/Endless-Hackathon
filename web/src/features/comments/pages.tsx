import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F21",
  slug: "comments",
  routes: [
    { path: "/comment-replies", permission: "business.channels", load: () => import("./Placeholder") },
  ],
  menu: [
    { path: "/comment-replies", group: "live", labelKey: "comments:menu.title", icon: "CommentOutlined", order: 180, permission: "business.channels" },
  ],
});

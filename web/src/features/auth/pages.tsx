import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F02",
  slug: "auth",
  routes: [
    { path: "/login", auth: 'none', layout: 'public', load: () => import("./Login") },
    { path: "/signup", auth: 'none', layout: 'public', load: () => import("./Signup") },
    { path: "/verify-email", auth: 'none', layout: 'public', load: () => import("./VerifyEmail") },
    { path: "/forgot-password", auth: 'none', layout: 'public', load: () => import("./Placeholder") },
    { path: "/reset-password", auth: 'none', layout: 'public', load: () => import("./Placeholder") },
  ],
  menu: [
  ],
});

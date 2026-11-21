import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F02",
  slug: "auth",
  routes: [
    { path: "/login", auth: 'none', layout: 'public', load: () => import("./Login") },
    { path: "/signup", auth: 'none', layout: 'public', load: () => import("./Signup") },
    { path: "/forgot-password", auth: 'none', layout: 'public', load: () => import("./ForgotPassword") },
    { path: "/reset-password", auth: 'none', layout: 'public', load: () => import("./ResetPassword") },
  ],
  menu: [
  ],
  slots: [
    { slot: 'accountTabs', id: 'auth.account', order: 10, labelKey: 'auth:account.tab', load: () => import('./AccountTab') },
  ],
});

import { defineFeaturePages } from '../../core';

export default defineFeaturePages({
  featureId: "F02",
  slug: "auth",
  routes: [
    { path: "/login", auth: 'none', layout: 'public', load: () => import("./Login") },
    { path: "/signup", auth: 'none', layout: 'public', load: () => import("./Signup") },
    { path: "/verify-email", auth: 'none', layout: 'public', load: () => import("./VerifyEmail") },
    { path: "/forgot-password", auth: 'none', layout: 'public', load: () => import("./ForgotPassword") },
    { path: "/reset-password", auth: 'none', layout: 'public', load: () => import("./ResetPassword") },
  ],
  menu: [
  ],
  slots: [
    { slot: 'accountTabs', id: 'auth.account', order: 10, labelKey: 'auth:account.tab', load: () => import('./AccountTab') },
    { slot: 'topbarActions', id: 'auth.verify-chip', order: 20, load: () => import('./VerificationChip') },
  ],
});

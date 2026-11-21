import { defineFeatureRoutes } from '../../core';

export default defineFeatureRoutes({
  featureId: "F14",
  slug: "payments",
  register(api) {
    api.get("/features/payments/status", { auth: 'user', summary: 'placeholder status' }, async () => ({"featureId":"F14","slug":"payments","lane":"A2","implemented":false,"mode":"U"}));
  },
});
